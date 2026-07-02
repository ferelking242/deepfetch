import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { getConfig } from '../config/loader.js'
import { runExtractionPipeline } from '../extraction/pipeline.js'

export class InstagramAdapter implements PlatformAdapter {
  readonly name = 'instagram'
  readonly domains = ['instagram.com', 'www.instagram.com']
  readonly requiresSession = true

  constructor(
    private readonly pool: BrowserPool,
    private readonly aiEngine: AIEngine,
    private readonly logger: Logger
  ) {}

  canHandle(url: string): boolean {
    return this.domains.some(d => url.includes(d))
  }

  async scrape(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()

    // Public posts: try Jina Reader first (no auth needed)
    if (!session) {
      try {
        const jinaUrl = `https://r.jina.ai/${encodeURIComponent(job.url)}`
        const res = await fetch(jinaUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(12_000),
        })
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          return { url: job.url, platform: 'instagram', data, extracted_by: 'selectors', duration_ms: 0 }
        }
      } catch (err) {
        logger.debug({ err }, 'Instagram: Jina Reader failed')
      }
    }

    // Playwright with session
    const context = await this.pool.acquire(session?.cookies)
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)

      await page.goto(job.url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)

      if (job.options.scroll) {
        await page.evaluate(() => window.scrollBy(0, 600))
        await page.waitForTimeout(1200)
      }

      const { data, extracted_by } = await runExtractionPipeline(page, 'instagram', logger, this.aiEngine)

      // Extract comments
      if ((job.options.max_comments ?? 0) > 0) {
        const comments = await this.extractComments(page, job.options.max_comments ?? 20)
        if (comments.length) data['comments'] = comments
      }

      await page.close()
      return { url: job.url, platform: 'instagram', data, extracted_by, duration_ms: 0 }
    } finally {
      await this.pool.release(context)
    }
  }

  private async extractComments(page: import('playwright').Page, max: number) {
    return page.evaluate((max: number) => {
      const items = Array.from(document.querySelectorAll('ul ul li'))
      return items.slice(0, max).map(el => ({
        author: el.querySelector('a[role="link"] span')?.textContent?.trim() ?? null,
        text: el.querySelector('span:last-child')?.textContent?.trim() ?? null,
        published_at: el.querySelector('time')?.getAttribute('datetime') ?? null,
      }))
    }, max)
  }
}
