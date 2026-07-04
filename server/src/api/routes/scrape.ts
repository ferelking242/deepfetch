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

// ── Action schemas ────────────────────────────────────────────────────────────

const ClickAction = z.object({
  type: z.literal('click'),
  selector: z.string(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  count: z.number().int().min(1).max(10).optional(),
  delay: z.number().min(0).max(2000).optional(),
})

const FillAction = z.object({
  type: z.literal('fill'),
  selector: z.string(),
  value: z.string(),
})

const TypeAction = z.object({
  type: z.literal('type'),
  selector: z.string(),
  text: z.string(),
  delay: z.number().min(0).max(500).optional(),
})

const PressAction = z.object({
  type: z.literal('press'),
  key: z.string(),
  modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional(),
})

const SelectAction = z.object({
  type: z.literal('select'),
  selector: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
})

const CheckAction    = z.object({ type: z.literal('check'),   selector: z.string() })
const UncheckAction  = z.object({ type: z.literal('uncheck'), selector: z.string() })
const FocusAction    = z.object({ type: z.literal('focus'),   selector: z.string() })
const ClearAction    = z.object({ type: z.literal('clear'),   selector: z.string() })
const HoverAction    = z.object({ type: z.literal('hover'),   selector: z.string() })

const DragAction = z.object({
  type: z.literal('drag'),
  source: z.string(),
  target: z.string(),
})

const UploadFileAction = z.object({
  type: z.literal('upload_file'),
  selector: z.string(),
  files: z.array(z.string()).min(1).max(10),
})

// Navigation
const GotoAction = z.object({
  type: z.literal('goto'),
  url: z.string().url(),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
})

const GoBackAction    = z.object({ type: z.literal('go_back') })
const GoForwardAction = z.object({ type: z.literal('go_forward') })

const ReloadAction = z.object({
  type: z.literal('reload'),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
})

// Wait
const WaitAction = z.object({
  type: z.literal('wait'),
  ms: z.number().int().min(0).max(60_000),
})

const WaitSelectorAction = z.object({
  type: z.literal('wait_for_selector'),
  selector: z.string(),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
  timeout: z.number().int().min(100).max(60_000).optional(),
})

const WaitUrlAction = z.object({
  type: z.literal('wait_for_url'),
  pattern: z.string(),
  timeout: z.number().int().min(100).max(60_000).optional(),
})

const WaitLoadStateAction = z.object({
  type: z.literal('wait_for_load_state'),
  state: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  timeout: z.number().int().min(100).max(60_000).optional(),
})

const WaitFunctionAction = z.object({
  type: z.literal('wait_for_function'),
  expression: z.string(),
  timeout: z.number().int().min(100).max(60_000).optional(),
})

const WaitResponseAction = z.object({
  type: z.literal('wait_for_response'),
  url_pattern: z.string(),
  timeout: z.number().int().min(100).max(60_000).optional(),
  as: z.string().optional(),
})

// Scroll
const ScrollAction = z.object({
  type: z.literal('scroll'),
  selector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
})

const ScrollBottomAction = z.object({
  type: z.literal('scroll_to_bottom'),
  max_height: z.number().int().min(100).max(100_000).optional(),
  step: z.number().int().min(50).max(2000).optional(),
  delay_ms: z.number().int().min(0).max(2000).optional(),
})

// Viewport / Environment
const SetViewportAction = z.object({
  type: z.literal('set_viewport'),
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(240).max(2160),
})

const SetGeolocationAction = z.object({
  type: z.literal('set_geolocation'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(200).optional(),
})

const EmulateDeviceAction = z.object({
  type: z.literal('emulate_device'),
  device: z.enum(['mobile', 'tablet', 'desktop']),
})

// JavaScript
const EvaluateAction = z.object({
  type: z.literal('evaluate'),
  expression: z.string(),
  as: z.string().optional(),
})

const SetLocalStorageAction = z.object({
  type: z.literal('set_local_storage'),
  key: z.string(),
  value: z.string(),
})

const SetCookieAction = z.object({
  type: z.literal('set_cookie'),
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
})

const ClearCookiesAction = z.object({ type: z.literal('clear_cookies') })

// Mid-action Capture
const ScreenshotAction = z.object({
  type: z.literal('screenshot'),
  selector: z.string().optional(),
  full_page: z.boolean().optional(),
  as: z.string().optional(),
})

const GetTextAction = z.object({
  type: z.literal('get_text'),
  selector: z.string(),
  as: z.string().optional(),
})

const GetAttributeAction = z.object({
  type: z.literal('get_attribute'),
  selector: z.string(),
  attribute: z.string(),
  as: z.string().optional(),
})

const GetValueAction = z.object({
  type: z.literal('get_value'),
  selector: z.string(),
  as: z.string().optional(),
})

// Network
const BlockResourcesAction = z.object({
  type: z.literal('block_resources'),
  resource_types: z.array(z.enum(['image', 'font', 'media', 'stylesheet'])).min(1),
})

const SetHeadersAction = z.object({
  type: z.literal('set_headers'),
  headers: z.record(z.string()),
})

// Anti-bot / CAPTCHA
const SolveCaptchaAction = z.object({
  type: z.literal('solve_captcha'),
  variant: z.enum(['recaptcha_v2', 'recaptcha_v3', 'hcaptcha', 'cloudflare', 'auto']).optional(),
})

const HumanizeMouseAction = z.object({
  type: z.literal('humanize_mouse'),
  selector: z.string(),
  jitter: z.number().min(0).max(20).optional(),
})

// ── Combined action schema ────────────────────────────────────────────────────

const ActionSchema = z.discriminatedUnion('type', [
  ClickAction, FillAction, TypeAction, PressAction, SelectAction,
  CheckAction, UncheckAction, FocusAction, ClearAction, HoverAction,
  DragAction, UploadFileAction,
  GotoAction, GoBackAction, GoForwardAction, ReloadAction,
  WaitAction, WaitSelectorAction, WaitUrlAction, WaitLoadStateAction,
  WaitFunctionAction, WaitResponseAction,
  ScrollAction, ScrollBottomAction,
  SetViewportAction, SetGeolocationAction, EmulateDeviceAction,
  EvaluateAction, SetLocalStorageAction, SetCookieAction, ClearCookiesAction,
  ScreenshotAction, GetTextAction, GetAttributeAction, GetValueAction,
  BlockResourcesAction, SetHeadersAction,
  SolveCaptchaAction, HumanizeMouseAction,
])

// ── Scrape body schema ────────────────────────────────────────────────────────

const ScrapeBodySchema = z.object({
  url: z.string().url(),
  session_id: z.string().uuid().optional(),
  priority: z.enum(['high', 'normal', 'batch']).default('normal'),
  sync: z.boolean().default(false),
  output: z.array(z.enum(['json', 'markdown', 'html', 'screenshot'])).default(['json']),
  options: z.object({
    extract: z.array(z.string()).optional(),
    max_comments: z.number().int().min(0).max(200).default(20),
    scroll: z.boolean().default(false),
    wait_for: z.string().optional(),
    timeout_ms: z.number().int().min(1000).max(120_000).optional(),
    actions: z.array(ActionSchema).optional(),
  }).default({}),
})

// ── Route registration ────────────────────────────────────────────────────────

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

    if (session_id) {
      const session = sessionStore.get(session_id)
      if (!session) return reply.status(404).send({ error: `Session ${session_id} not found` })
      if (session.status === 'expired') return reply.status(400).send({ error: `Session ${session_id} is expired` })
    }

    const adapter = registry.resolve(url)

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

    const timeout = (options.timeout_ms ?? 60_000) + 5_000
    const start = Date.now()
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 500))
      const updated = queue.getJob(job.id)
      if (!updated) break

      if (updated.status === 'done' && updated.result) {
        const response: Record<string, unknown> = {
          job_id: updated.id,
          status: 'done',
          platform: updated.platform,
        }
        if (output.includes('json'))       response['json'] = updated.result.data
        if (output.includes('markdown'))   response['markdown'] = toMarkdown(updated.result)
        if (output.includes('html'))       response['html'] = updated.result.html ?? null
        if (output.includes('screenshot')) response['screenshot_path'] = updated.result.screenshot_path ?? null
        if (updated.result.action_results && Object.keys(updated.result.action_results).length > 0) {
          response['action_results'] = updated.result.action_results
        }
        response['extracted_by'] = updated.result.extracted_by
        response['duration_ms']  = updated.result.duration_ms
        return reply.send(response)
      }

      if (updated.status === 'failed') {
        return reply.status(500).send({ job_id: updated.id, status: 'failed', error: updated.error })
      }

      if (updated.status === 'cancelled') {
        return reply.status(409).send({ job_id: updated.id, status: 'cancelled' })
      }
    }

    return reply.status(408).send({
      job_id: job.id,
      status: 'timeout',
      message: 'Job did not complete in time. Poll the job ID.',
    })
  })
}
