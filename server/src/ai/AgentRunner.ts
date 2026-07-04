/**
 * AgentRunner — OpenManus-inspired multi-step AI agent with planning.
 *
 * Uses a ReAct (Reason + Act) loop:
 *   1. generateObject → LLM decides {thought, tool, args}
 *   2. Execute tool manually → get result
 *   3. Append to history
 *   4. Repeat until done or max_steps
 *
 * Streams events via AsyncGenerator<AgentEvent> for real-time SSE.
 *
 * Available tools:
 *   navigate, act, extract, observe, screenshot,
 *   web_search, get_text, run_js, done
 */

import type { Page } from 'playwright'
import type { Logger } from 'pino'
import { generateObject } from 'ai'
import { z } from 'zod'
import { AIEngine } from './AIEngine.js'
import { ActionEngine } from './ActionEngine.js'
import { BrowserPool } from '../core/BrowserPool.js'
import { SessionStore } from '../sessions/SessionStore.js'

// ── Event types ────────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'start';       task: string; tools: string[]; max_steps: number; provider: string }
  | { type: 'step';        index: number; thought: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; index: number; tool: string; result: unknown; duration_ms: number; url?: string }
  | { type: 'done';        result: unknown; summary: string; total_steps: number; duration_ms: number }
  | { type: 'error';       message: string; step?: number }

export interface AgentOptions {
  tools?: string[]
  maxSteps?: number
  sessionId?: string
}

// ── Step schema ────────────────────────────────────────────────────────────────

const StepSchema = z.object({
  thought: z.string().describe('Your reasoning about what to do in this step'),
  tool: z.enum(['navigate', 'act', 'extract', 'observe', 'screenshot', 'web_search', 'get_text', 'run_js', 'done']),
  // Tool arguments — only the relevant fields for the chosen tool are used
  url: z.string().optional().describe('[navigate] Full URL to navigate to'),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe('[navigate] When to consider done'),
  instruction: z.string().optional().describe('[act/extract] Natural language instruction'),
  schema: z.record(z.unknown()).optional().describe('[extract] JSON Schema properties for structured output'),
  full_page: z.boolean().optional().describe('[screenshot] Capture full page'),
  selector: z.string().optional().describe('[screenshot/get_text] Target CSS selector'),
  query: z.string().optional().describe('[web_search] Search query'),
  max_chars: z.number().optional().describe('[get_text] Max characters to return'),
  code: z.string().optional().describe('[run_js] JavaScript expression to evaluate'),
  result: z.record(z.unknown()).optional().describe('[done] Final result object'),
  summary: z.string().optional().describe('[done] Human-readable summary of what was accomplished'),
})

type AgentStep = z.infer<typeof StepSchema>

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(enabledTools: string[]): string {
  const toolDocs: Record<string, string> = {
    navigate:   'navigate(url, wait_until?) — Go to a URL',
    act:        'act(instruction) — Natural language browser interaction: "click login button", "type user@example.com in email field"',
    extract:    'extract(instruction, schema?) — AI-powered structured data extraction from current page',
    observe:    'observe() — List all interactive elements on the current page',
    screenshot: 'screenshot(full_page?, selector?) — Capture current page as image',
    web_search: 'web_search(query) — Search the web without navigating the browser',
    get_text:   'get_text(max_chars?, selector?) — Get visible text from the page or element',
    run_js:     'run_js(code) — Evaluate JavaScript expression in the page',
    done:       'done(result, summary) — MUST be called when task is complete',
  }
  const docs = enabledTools.concat(['done']).map(t => `  • ${toolDocs[t] ?? t}`).join('\n')

  return `You are DeepFetch Agent — an AI that controls a real Chromium browser to complete web tasks.

Available tools:
${docs}

Rules:
1. Always start with 'thought' — reason briefly before choosing a tool
2. Use 'navigate' to go to URLs, 'act' for interactions, 'extract' for data
3. If a step fails, adapt: try a different selector, URL, or approach
4. Always call 'done' when the task is complete or you cannot progress further
5. Be efficient — minimize page loads and LLM calls
6. For structured data, prefer 'extract' with a schema over 'get_text'
7. Extract results go in 'done.result' — compile all data before calling done`
}

// ── History builder ────────────────────────────────────────────────────────────

interface HistoryEntry {
  step: number
  tool: string
  args: Record<string, unknown>
  result: unknown
  success: boolean
}

function buildHistoryPrompt(task: string, history: HistoryEntry[], currentUrl: string): string {
  const lines = [
    `Task: ${task}`,
    `Current URL: ${currentUrl}`,
    '',
  ]

  if (history.length > 0) {
    lines.push('Previous steps:')
    for (const h of history.slice(-8)) { // Keep last 8 steps to avoid token overflow
      const resultSummary = JSON.stringify(h.result).slice(0, 300)
      lines.push(`  Step ${h.step}: ${h.tool}(${JSON.stringify(h.args).slice(0, 150)}) → ${h.success ? 'OK' : 'FAILED'}: ${resultSummary}`)
    }
    lines.push('')
  }

  lines.push('What should you do next? Choose a tool and fill in the appropriate arguments.')
  return lines.join('\n')
}

// ── Tool executor ──────────────────────────────────────────────────────────────

async function executeTool(
  step: AgentStep,
  page: Page,
  actionEngine: ActionEngine,
  enabledTools: Set<string>,
): Promise<{ result: unknown; success: boolean }> {
  const tool = step.tool

  if (!enabledTools.has(tool) && tool !== 'done') {
    return { result: `Tool '${tool}' is not enabled`, success: false }
  }

  try {
    switch (tool) {
      case 'navigate': {
        if (!step.url) return { result: 'url is required for navigate', success: false }
        await page.goto(step.url, {
          waitUntil: step.wait_until ?? 'domcontentloaded',
          timeout: 30_000,
        })
        await page.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => null)
        return { result: { url: page.url(), title: await page.title() }, success: true }
      }

      case 'act': {
        if (!step.instruction) return { result: 'instruction is required for act', success: false }
        const result = await actionEngine.act(page, step.instruction, { useCache: true })
        return { result, success: result.success }
      }

      case 'extract': {
        if (!step.instruction) return { result: 'instruction is required for extract', success: false }
        const schema = step.schema ? { type: 'object', properties: step.schema } : undefined
        const data = await actionEngine.extract(page, step.instruction, schema)
        return { result: { data, url: page.url() }, success: data !== null }
      }

      case 'observe': {
        const obs = await actionEngine.observe(page)
        return { result: obs, success: true }
      }

      case 'screenshot': {
        const buf = step.selector
          ? await page.locator(step.selector).first().screenshot({ type: 'jpeg', quality: 75 }).catch(() => null)
          : await page.screenshot({ type: 'jpeg', quality: 75, fullPage: step.full_page ?? false })
        return {
          result: {
            format: 'jpeg',
            size_bytes: buf?.length ?? 0,
            url: page.url(),
            preview: buf ? `data:image/jpeg;base64,${buf.toString('base64').slice(0, 100)}…` : null,
          },
          success: buf !== null,
        }
      }

      case 'web_search': {
        if (!step.query) return { result: 'query is required for web_search', success: false }
        // Try Jina search
        const resp = await fetch(`https://s.jina.ai/${encodeURIComponent(step.query)}`, {
          headers: { 'Accept': 'text/plain', 'User-Agent': 'DeepFetch/1.0' },
          signal: AbortSignal.timeout(12_000),
        }).catch(() => null)
        if (!resp?.ok) {
          // Fallback: DuckDuckGo HTML
          const ddg = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(step.query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10_000),
          }).catch(() => null)
          const txt = await ddg?.text() ?? 'Search failed'
          return { result: { text: txt.slice(0, 3000), query: step.query }, success: true }
        }
        const txt = await resp.text()
        return { result: { text: txt.slice(0, 3000), query: step.query }, success: true }
      }

      case 'get_text': {
        const maxChars = step.max_chars ?? 8000
        let text: string
        if (step.selector) {
          text = await page.locator(step.selector).first().innerText({ timeout: 5000 }).catch(() => '')
        } else {
          text = await page.evaluate(() => (document.body as HTMLElement).innerText ?? '')
        }
        return {
          result: { text: text.slice(0, maxChars), truncated: text.length > maxChars, url: page.url() },
          success: true,
        }
      }

      case 'run_js': {
        if (!step.code) return { result: 'code is required for run_js', success: false }
        const val = await page.evaluate(step.code).catch((err: Error) => `ERROR: ${err.message}`)
        const resultStr = typeof val === 'string' ? val : JSON.stringify(val)
        return { result: { value: resultStr.slice(0, 4000) }, success: !String(val).startsWith('ERROR:') }
      }

      case 'done': {
        return {
          result: {
            _done: true,
            result: step.result ?? {},
            summary: step.summary ?? 'Task completed',
          },
          success: true,
        }
      }

      default:
        return { result: `Unknown tool: ${tool}`, success: false }
    }
  } catch (err) {
    return { result: { error: (err as Error).message }, success: false }
  }
}

// ── AgentRunner ────────────────────────────────────────────────────────────────

export class AgentRunner {
  private readonly ai: AIEngine
  private readonly actionEngine: ActionEngine
  private readonly pool: BrowserPool
  private readonly sessionStore: SessionStore
  private readonly logger: Logger

  constructor(
    ai: AIEngine,
    actionEngine: ActionEngine,
    pool: BrowserPool,
    sessionStore: SessionStore,
    logger: Logger,
  ) {
    this.ai = ai
    this.actionEngine = actionEngine
    this.pool = pool
    this.sessionStore = sessionStore
    this.logger = logger.child({ component: 'AgentRunner' })
  }

  async *run(task: string, options: AgentOptions = {}): AsyncGenerator<AgentEvent> {
    const {
      tools: enabledToolNames = ['navigate', 'act', 'extract', 'observe', 'screenshot', 'web_search', 'get_text', 'run_js'],
      maxSteps = 15,
      sessionId,
    } = options

    const enabledTools = new Set(enabledToolNames)
    const startTime = Date.now()

    // ── Check AI provider ──────────────────────────────────────────────────────
    const selected = (this.ai as unknown as {
      selectProvider: () => { provider: unknown; config: { name: string; model: string } } | null
    }).selectProvider()

    if (!selected) {
      yield { type: 'error', message: 'No AI provider configured. Add an API key in Settings → API Keys, or in config.yaml → ai_engine.providers.' }
      return
    }

    const { provider, config: pcfg } = selected
    const model = (provider as (m: string) => unknown)(pcfg.model)

    yield {
      type: 'start',
      task,
      tools: Array.from(enabledTools),
      max_steps: maxSteps,
      provider: `${pcfg.name}/${pcfg.model}`,
    }

    // ── Load session cookies ───────────────────────────────────────────────────
    let cookies: Array<{ name: string; value: string; domain?: string; path?: string }> = []
    if (sessionId) {
      try {
        const sess = (this.sessionStore as unknown as { get: (id: string) => { cookies?: typeof cookies } | null }).get(sessionId)
        if (sess?.cookies) cookies = sess.cookies
      } catch { /* no session */ }
    }

    // ── Acquire browser ────────────────────────────────────────────────────────
    const context = await this.pool.acquire({ cookies })
    const page = await context.newPage()
    await page.goto('about:blank').catch(() => null)

    const history: HistoryEntry[] = []
    const systemPrompt = buildSystemPrompt(Array.from(enabledTools))

    try {
      for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex++) {
        // ── Ask LLM what to do ───────────────────────────────────────────────
        const prompt = buildHistoryPrompt(task, history, page.url())

        let agentStep: AgentStep
        try {
          const { object } = await generateObject({
            model: model as Parameters<typeof generateObject>[0]['model'],
            schema: StepSchema,
            system: systemPrompt,
            prompt,
            maxTokens: 2048,
            temperature: 0.1,
          })
          agentStep = object
        } catch (err) {
          const msg = (err as Error).message
          this.logger.error({ err, step: stepIndex }, 'generateObject failed')
          yield { type: 'error', message: `LLM error at step ${stepIndex}: ${msg}`, step: stepIndex }
          break
        }

        // Build args object for event display
        const args: Record<string, unknown> = {}
        if (agentStep.url) args.url = agentStep.url
        if (agentStep.instruction) args.instruction = agentStep.instruction
        if (agentStep.query) args.query = agentStep.query
        if (agentStep.code) args.code = agentStep.code
        if (agentStep.selector) args.selector = agentStep.selector
        if (agentStep.schema) args.schema = agentStep.schema
        if (agentStep.result) args.result = agentStep.result

        this.logger.info({ step: stepIndex, tool: agentStep.tool, thought: agentStep.thought.slice(0, 100) }, 'Agent step')

        yield {
          type: 'step',
          index: stepIndex,
          thought: agentStep.thought,
          tool: agentStep.tool,
          args,
        }

        // ── Execute tool ─────────────────────────────────────────────────────
        const t0 = Date.now()
        const { result, success } = await executeTool(agentStep, page, this.actionEngine, enabledTools)
        const duration_ms = Date.now() - t0

        yield {
          type: 'tool_result',
          index: stepIndex,
          tool: agentStep.tool,
          result,
          duration_ms,
          url: page.url() === 'about:blank' ? undefined : page.url(),
        }

        // ── Add to history ───────────────────────────────────────────────────
        history.push({
          step: stepIndex,
          tool: agentStep.tool,
          args,
          result,
          success,
        })

        // ── Check done ───────────────────────────────────────────────────────
        if (agentStep.tool === 'done') {
          const done = result as { result: Record<string, unknown>; summary: string }
          yield {
            type: 'done',
            result: done.result ?? result,
            summary: agentStep.summary ?? done.summary ?? 'Task completed',
            total_steps: stepIndex,
            duration_ms: Date.now() - startTime,
          }
          return
        }
      }

      // Max steps reached
      yield {
        type: 'done',
        result: { _note: 'Max steps reached', steps: history.length, last_url: page.url() },
        summary: `Reached ${maxSteps} step limit without completing the task`,
        total_steps: history.length,
        duration_ms: Date.now() - startTime,
      }

    } finally {
      await page.close().catch(() => null)
      await this.pool.release(context)
    }
  }
}
