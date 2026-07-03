import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { JobQueue } from '../../core/JobQueue.js'
import type { BrowserPool } from '../../core/BrowserPool.js'
import type { PlatformRegistry } from '../../platforms/registry.js'
import type { SessionStore } from '../../sessions/SessionStore.js'
import type { ResourceManager } from '../../core/ResourceManager.js'
import type { AIEngine } from '../../ai/AIEngine.js'
import { toJson } from '../../output/toJson.js'
import { toMarkdown } from '../../output/toMarkdown.js'
import { takeScreenshot } from '../../output/toScreenshot.js'

const ScrapeBodySchema = z.object({
  url: z.string().url(),
  session_id: z.string().uuid().optional(),
  priority: z.enum(['high', 'normal', 'batch']).default('normal'),
  sync: z.boolean().default(false), // true = wait for result, false = return job_id
  output: z.array(z.enum(['json', 'markdown', 'html', 'screenshot'])).default(['json']),
  options: z.object({
    extract: z.array(z.string()).optional(),
    max_comments: z.number().int().min(0).max(200).default(20),
    scroll: z.boolean().default(false),
    wait_for: z.string().optional(),
    timeout_ms: z.number().int().min(1000).max(120_000).optional(),
      actions: z.array(z.union([
        z.object({ type: z.literal('fill'), selector: z.string(), value: z.string() }),
        z.object({ type: z.literal('click'), selector: z.string() }),
        z.object({ type: z.literal('wait_for_url'), pattern: z.string() }),
        z.object({ type: z.literal('wait_for_selector'), selector: z.string() }),
        z.object({ type: z.literal('select'), selector: z.string(), value: z.string() }),
      ])).optional(),
    }).default({}),
})

export function registerScrapeRoutes(
  fastify: FastifyInstance,
  deps: {
    queue: JobQueue
    pool: BrowserPool
    registry: PlatformRegistry
    sessionStore: SessionStore
    resources: ResourceManager
    aiEngine: AIEngine
  }
): void {
  const { queue, pool, registry, sessionStore, resources } = deps

  fastify.post('/v1/scrape', async (req, reply) => {
    const body = ScrapeBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { url, session_id, priority, sync, output, options } = body.data

    // Validate session if provided
    if (session_id) {
      const session = sessionStore.get(session_id)
      if (!session) return reply.status(404).send({ error: `Session ${session_id} not found` })
      if (session.status === 'expired') return reply.status(400).send({ error: `Session ${session_id} is expired` })
    }

    // Determine platform
    const adapter = registry.resolve(url)

    // Enqueue job
    const job = queue.enqueue({
      url,
      platform: adapter.name,
      priority,
      session_id,
      options: { ...options, output },
    })

    if (!sync) {
      return reply.status(202).send({
        job_id: job.id,
        status: 'queued',
        platform: adapter.name,
        message: `Poll GET /v1/jobs/${job.id} for result or connect to WS /v1/jobs/${job.id}/stream`,
      })
    }

    // Sync mode: poll until done (max 120s)
    const timeout = (options.timeout_ms ?? 60_000) + 5_000
    const start = Date.now()
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 500))
      const updated = queue.getJob(job.id)
      if (!updated) break

      if (updated.status === 'done' && updated.result) {
        const response: Record<string, unknown> = { job_id: updated.id, status: 'done', platform: updated.platform }

        if (output.includes('json'))       response['json'] = updated.result.data
        if (output.includes('markdown'))   response['markdown'] = toMarkdown(updated.result)
        if (output.includes('html'))       response['html'] = updated.result.html ?? null
        if (output.includes('screenshot')) response['screenshot_path'] = updated.result.screenshot_path ?? null

        response['extracted_by'] = updated.result.extracted_by
        response['duration_ms'] = updated.result.duration_ms

        return reply.send(response)
      }

      if (updated.status === 'failed') {
        return reply.status(500).send({ job_id: updated.id, status: 'failed', error: updated.error })
      }

      if (updated.status === 'cancelled') {
        return reply.status(409).send({ job_id: updated.id, status: 'cancelled' })
      }
    }

    return reply.status(408).send({ job_id: job.id, status: 'timeout', message: 'Job did not complete in time. Poll the job ID.' })
  })
}
