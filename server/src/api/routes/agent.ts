/**
 * Agent routes — Stagehand + OpenManus features
 *
 * POST /v1/act       — Natural language browser action on a URL
 * POST /v1/extract   — AI-powered structured extraction from a URL
 * POST /v1/observe   — List interactive elements on a URL
 * POST /v1/agent     — Multi-step autonomous agent (SSE streaming)
 * GET  /v1/agent/cache        — Action cache stats
 * GET  /v1/agent/cache/list   — List cached actions
 * DELETE /v1/agent/cache/:key — Remove a cached action
 * DELETE /v1/agent/cache      — Clear entire cache
 */

import type { FastifyInstance } from 'fastify'
import type { BrowserPool } from '../../core/BrowserPool.js'
import type { ActionEngine } from '../../ai/ActionEngine.js'
import type { AgentRunner } from '../../ai/AgentRunner.js'
import type { SessionStore } from '../../sessions/SessionStore.js'

interface AgentDeps {
  pool: BrowserPool
  actionEngine: ActionEngine
  agentRunner: AgentRunner
  sessionStore: SessionStore
}

export function registerAgentRoutes(fastify: FastifyInstance, deps: AgentDeps): void {
  const { pool, actionEngine, agentRunner } = deps

  // ── Helper: acquire browser + navigate ───────────────────────────────────────
  async function withPage<T>(
    url: string,
    sessionId: string | undefined,
    deps2: AgentDeps,
    fn: (page: import('playwright').Page) => Promise<T>,
  ): Promise<T> {
    let cookies: Array<{ name: string; value: string; domain?: string; path?: string }> = []
    if (sessionId) {
      try {
        const sess = (deps2.sessionStore as unknown as {
          get: (id: string) => { cookies?: typeof cookies } | null
        }).get(sessionId)
        if (sess?.cookies) cookies = sess.cookies
      } catch { /* ignore */ }
    }

    const context = await pool.acquire({ cookies })
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => null)
      return await fn(page)
    } finally {
      await page.close().catch(() => null)
      await pool.release(context)
    }
  }

  // ── POST /v1/act ─────────────────────────────────────────────────────────────
  fastify.post('/v1/act', {
    schema: {
      description: 'Perform a natural-language browser action on a URL',
      body: {
        type: 'object',
        required: ['url', 'instruction'],
        properties: {
          url: { type: 'string', description: 'Target URL' },
          instruction: { type: 'string', description: 'Natural language action e.g. "Click the login button"' },
          session_id: { type: 'string', description: 'Session ID for authenticated pages' },
          use_cache: { type: 'boolean', default: true, description: 'Use cached actions if available' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      url: string
      instruction: string
      session_id?: string
      use_cache?: boolean
    }

    const result = await withPage(body.url, body.session_id, deps, async (page) => {
      return actionEngine.act(page, body.instruction, { useCache: body.use_cache !== false })
    })

    return reply.send(result)
  })

  // ── POST /v1/extract ──────────────────────────────────────────────────────────
  fastify.post('/v1/extract', {
    schema: {
      description: 'Extract structured data from a URL using AI and an optional JSON schema',
      body: {
        type: 'object',
        required: ['url', 'instruction'],
        properties: {
          url: { type: 'string' },
          instruction: { type: 'string', description: 'What data to extract' },
          schema: { type: 'object', description: 'JSON Schema properties for the expected output' },
          session_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      url: string
      instruction: string
      schema?: Record<string, unknown>
      session_id?: string
    }

    const result = await withPage(body.url, body.session_id, deps, async (page) => {
      const schema = body.schema ? { type: 'object', properties: body.schema } : undefined
      const data = await actionEngine.extract(page, body.instruction, schema)
      return { url: page.url(), data, instruction: body.instruction }
    })

    return reply.send(result)
  })

  // ── POST /v1/observe ──────────────────────────────────────────────────────────
  fastify.post('/v1/observe', {
    schema: {
      description: 'List all interactive elements on a page with AI descriptions',
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
          session_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as { url: string; session_id?: string }

    const result = await withPage(body.url, body.session_id, deps, async (page) => {
      return actionEngine.observe(page)
    })

    return reply.send(result)
  })

  // ── POST /v1/agent (SSE streaming) ────────────────────────────────────────────
  fastify.post('/v1/agent', {
    schema: {
      description: 'Run a multi-step autonomous agent with real-time SSE streaming',
      body: {
        type: 'object',
        required: ['task'],
        properties: {
          task: { type: 'string', description: 'Natural language task description' },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Enabled tools: navigate, act, extract, observe, screenshot, web_search, get_text, run_js',
          },
          max_steps: { type: 'number', default: 15, minimum: 1, maximum: 50 },
          session_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      task: string
      tools?: string[]
      max_steps?: number
      session_id?: string
    }

    return new Promise<void>((resolve) => {
      reply.hijack()
      const raw = reply.raw

      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      })

      const send = (event: string, data: unknown) => {
        if (!raw.destroyed) {
          raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }
      }

      ;(async () => {
        try {
          for await (const event of agentRunner.run(body.task, {
            tools: body.tools,
            maxSteps: body.max_steps ?? 15,
            sessionId: body.session_id,
          })) {
            send(event.type, event)
            if (raw.destroyed) break
            if (event.type === 'done' || event.type === 'error') break
          }
        } catch (err) {
          send('error', { type: 'error', message: (err as Error).message })
        } finally {
          if (!raw.destroyed) raw.end()
          resolve()
        }
      })()
    })
  })

  // ── GET /v1/agent/cache ───────────────────────────────────────────────────────
  fastify.get('/v1/agent/cache', {
    schema: { description: 'Get action cache statistics' },
  }, async (_request, reply) => {
    const stats = actionEngine.actionCache.stats()
    return reply.send({ ...stats, description: 'SQLite-backed action cache (Stagehand-style)' })
  })

  // ── GET /v1/agent/cache/list ──────────────────────────────────────────────────
  fastify.get('/v1/agent/cache/list', {
    schema: { description: 'List cached actions' },
  }, async (request, reply) => {
    const q = request.query as { limit?: string }
    const limit = Math.min(Number(q.limit ?? 50), 200)
    const entries = actionEngine.actionCache.list(limit)
    return reply.send({ entries, count: entries.length })
  })

  // ── DELETE /v1/agent/cache ────────────────────────────────────────────────────
  fastify.delete('/v1/agent/cache', {
    schema: { description: 'Clear all cached actions' },
  }, async (_request, reply) => {
    actionEngine.actionCache.clear()
    return reply.send({ message: 'Action cache cleared' })
  })

  // ── DELETE /v1/agent/cache/:key ───────────────────────────────────────────────
  fastify.delete('/v1/agent/cache/:key', {
    schema: { description: 'Remove a specific cached action by key' },
  }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const deleted = actionEngine.actionCache.delete(key)
    return reply.send({ deleted, key })
  })
}
