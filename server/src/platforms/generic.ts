import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { runExtractionPipeline } from '../extraction/pipeline.js'
import { getConfig } from '../config/loader.js'
import { executeActions } from '../browser/ActionExecutor.js'

export class GenericAdapter implements PlatformAdapter {
  readonly name = 'generic'
  readonly domains = ['*']
  readonly requiresSession = false

  constructor(
    private readonly pool: BrowserPool,
    private readonly aiEngine: AIEngine,
    private readonly baseLogger: Logger
  ) {}

  canHandle(_url: string): boolean {
    return true
  }

  async scrape(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()

    // Try Jina Reader first for clean text extraction on public pages (no actions)
    if (!session && !job.options.actions?.length) {
      try {
        const jinaUrl = `https://r.jina.ai/${encodeURIComponent(job.url)}`
        const res = await fetch(jinaUrl, {
          headers: { 'Accept': 'application/json', 'X-Return-Format': 'json' },
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          const json = await res.json() as Record<string, unknown>
          logger.info('Generic: extracted via Jina Reader')
          return {
            url: job.url,
            platform: 'generic',
            data: json,
            extracted_by: 'selectors',
            duration_ms: 0,
          }
        }
      } catch (err) {
        logger.debug({ err }, 'Jina Reader failed, falling back to Playwright')
      }
    }

    // Playwright path
    const context = await this.pool.acquire(session?.cookies)
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)

      await page.goto(job.url, { waitUntil: 'domcontentloaded' })

      if (job.options.wait_for) {
        await page.waitForSelector(job.options.wait_for, { timeout: 10_000 }).catch(() => null)
      }

      if (job.options.scroll && !job.options.actions?.length) {
        await autoScroll(page)
      }

      // Execute rich browser actions
      let actionResults: Record<string, unknown> = {}
      if (job.options.actions?.length) {
        actionResults = await executeActions(page, context, job.options.actions, this.aiEngine, logger)
      }

      const finalUrl = page.url()
      const { data, extracted_by } = await runExtractionPipeline(page, 'generic', logger, this.aiEngine)

      await page.close()
      await this.pool.release(context)

      return {
        url: finalUrl,
        platform: 'generic',
        data,
        extracted_by,
        action_results: Object.keys(actionResults).length ? actionResults : undefined,
        duration_ms: 0,
      }
    } catch (err) {
      await this.pool.release(context)
      throw err
    }
  }
}

async function autoScroll(page: import('playwright').Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let totalHeight = 0
      const distance = 300
      const timer = setInterval(() => {
        window.scrollBy(0, distance)
        totalHeight += distance
        if (totalHeight >= document.body.scrollHeight - window.innerHeight || totalHeight > 15000) {
          clearInterval(timer)
          resolve()
        }
      }, 120)
    })
  })
  await page.waitForTimeout(500)
}
