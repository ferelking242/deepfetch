import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { runExtractionPipeline } from '../extraction/pipeline.js'
import { getConfig } from '../config/loader.js'

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
    return true // always matches as fallback
  }

  async scrape(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()

    // Try Jina Reader first for clean text extraction on public pages
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
            extracted_by: 'selectors', // Jina = structured selector-like
            duration_ms: 0,
          }
        }
      } catch (err) {
        logger.debug({ err }, 'Jina Reader failed, falling back to Playwright')
      }
    }

    // Playwright fallback
    const context = await this.pool.acquire(session?.cookies)
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)

      await page.goto(job.url, { waitUntil: 'domcontentloaded' })

      if (job.options.wait_for) {
        await page.waitForSelector(job.options.wait_for, { timeout: 10_000 }).catch(() => null)
      }

      if (job.options.scroll) {
        await autoScroll(page)
        }

        // Execute browser actions (fill, click, navigate) before extraction
        if (job.options.actions?.length) {
          for (const action of job.options.actions) {
            if (action.type === 'fill') {
              await page.fill(action.selector, action.value)
            } else if (action.type === 'click') {
              await page.click(action.selector)
              await page.waitForTimeout(1500)
            } else if (action.type === 'wait_for_url') {
              await page.waitForURL(action.pattern, { timeout: 15_000 }).catch(() => null)
            } else if (action.type === 'wait_for_selector') {
              await page.waitForSelector(action.selector, { timeout: 10_000 }).catch(() => null)
            } else if (action.type === 'select') {
              await page.selectOption(action.selector, action.value)
            }
          }
        }

        const finalUrl = page.url()
        const { data, extracted_by } = await runExtractionPipeline(page, 'generic', logger, this.aiEngine)

        await page.close()
        await this.pool.release(context)

        return { url: finalUrl, platform: 'generic', data, extracted_by, duration_ms: 0 }
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
