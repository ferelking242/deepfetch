import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { execa } from 'execa'
import { getConfig } from '../config/loader.js'
import { runExtractionPipeline } from '../extraction/pipeline.js'

export class TikTokAdapter implements PlatformAdapter {
  readonly name = 'tiktok'
  readonly domains = ['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com']
  readonly requiresSession = false

  constructor(
    private readonly pool: BrowserPool,
    private readonly aiEngine: AIEngine,
    private readonly logger: Logger
  ) {}

  canHandle(url: string): boolean {
    return this.domains.some(d => url.includes(d))
  }

  async scrape(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, logger } = ctx

    // Primary: zeusdl for video metadata
    let zeusdlData: Record<string, unknown> | null = null
    try {
      zeusdlData = await this.fetchWithZeusdl(job.url, logger)
    } catch (err) {
      logger.warn({ err }, 'TikTok: zeusdl failed')
    }

    // If zeusdl worked and no comments requested → return immediately
    if (zeusdlData && !job.options.max_comments) {
      return {
        url: job.url,
        platform: 'tiktok',
        data: zeusdlData,
        extracted_by: 'zeusdl',
        duration_ms: 0,
      }
    }

    // Need comments or zeusdl failed → use Playwright
    const playwrightData = await this.scrapeWithPlaywright(ctx)

    // Merge: zeusdl data wins for video metadata, Playwright provides comments
    if (zeusdlData) {
      return {
        ...playwrightData,
        data: { ...playwrightData.data, ...zeusdlData },
        extracted_by: 'zeusdl',
      }
    }

    return playwrightData
  }

  private async fetchWithZeusdl(url: string, logger: Logger): Promise<Record<string, unknown>> {
    const cfg = getConfig()

    // Resolve short URLs first
    const resolvedUrl = await this.resolveShortUrl(url)

    const { stdout } = await execa(cfg.zeusdl.binary, [
      resolvedUrl,
      '--dump-json',
      '--no-download',
      ...cfg.zeusdl.extra_flags,
    ], { timeout: 30_000 })

    const raw = JSON.parse(stdout) as Record<string, unknown>
    logger.info({ id: raw['id'] }, 'TikTok: metadata via zeusdl')

    return {
      id: raw['id'],
      title: raw['title'],
      description: raw['description'],
      author: raw['uploader'],
      author_id: raw['uploader_id'],
      author_url: raw['uploader_url'],
      view_count: raw['view_count'],
      like_count: raw['like_count'],
      repost_count: raw['repost_count'],
      comment_count: raw['comment_count'],
      bookmark_count: raw['bookmark_count'],
      duration: raw['duration'],
      duration_string: raw['duration_string'],
      upload_date: raw['upload_date'],
      timestamp: raw['timestamp'],
      thumbnail: raw['thumbnail'],
      thumbnails: raw['thumbnails'],
      webpage_url: raw['webpage_url'],
      tags: raw['tags'],
      music_title: (raw['music_info'] as Record<string, unknown>)?.['title'] ?? null,
      music_author: (raw['music_info'] as Record<string, unknown>)?.['author'] ?? null,
    }
  }

  private async resolveShortUrl(url: string): Promise<string> {
    if (!url.includes('vt.tiktok.com') && !url.includes('vm.tiktok.com')) return url
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) })
    return res.url || url
  }

  private async scrapeWithPlaywright(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()
    const context = await this.pool.acquire(session?.cookies)

    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)

      await page.goto(job.url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)

      // Scroll to load comments if requested
      if ((job.options.max_comments ?? 0) > 0) {
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 500))
          await page.waitForTimeout(800)
        }
      }

      const { data, extracted_by } = await runExtractionPipeline(page, 'tiktok', logger, this.aiEngine)

      // Extract comments from DOM
      const comments = await this.extractComments(page, job.options.max_comments ?? 20)
      if (comments.length > 0) data['comments'] = comments

      await page.close()
      return { url: job.url, platform: 'tiktok', data, extracted_by, duration_ms: 0 }
    } finally {
      await this.pool.release(context)
    }
  }

  private async extractComments(
    page: import('playwright').Page,
    maxComments: number
  ): Promise<Array<Record<string, unknown>>> {
    return page.evaluate((max: number) => {
      const items = Array.from(document.querySelectorAll('[data-e2e="comment-item"], .comment-item'))
      return items.slice(0, max).map(el => ({
        author: el.querySelector('[data-e2e="comment-username-1"], .author-uniqueId')?.textContent?.trim() ?? null,
        text: el.querySelector('[data-e2e="comment-level-1"], .comment-text')?.textContent?.trim() ?? null,
        likes: el.querySelector('[data-e2e="comment-like-count"]')?.textContent?.trim() ?? null,
        published_at: el.querySelector('span[data-e2e="comment-time"]')?.textContent?.trim() ?? null,
      }))
    }, maxComments)
  }
}
