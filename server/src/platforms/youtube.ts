import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { execa } from 'execa'
import { getConfig } from '../config/loader.js'
import { runExtractionPipeline } from '../extraction/pipeline.js'
import { normalizeCount } from '../extraction/schema.js'

export class YouTubeAdapter implements PlatformAdapter {
  readonly name = 'youtube'
  readonly domains = ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com']
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

    // Primary: zeusdl (most reliable, zero detection risk)
    try {
      const result = await this.scrapeWithZeusdl(job.url, logger)
      if (result) return result
    } catch (err) {
      logger.warn({ err }, 'YouTube: zeusdl failed, falling back to Playwright')
    }

    // Fallback: Playwright + ytInitialData blob
    return this.scrapeWithPlaywright(ctx)
  }

  private async scrapeWithZeusdl(url: string, logger: Logger): Promise<ScrapeResult | null> {
    const cfg = getConfig()
    const binary = cfg.zeusdl.binary

    const { stdout } = await execa(binary, [
      url,
      '--dump-json',
      '--no-download',
      '--no-playlist',
      '--flat-playlist',
      ...cfg.zeusdl.extra_flags,
    ], { timeout: 30_000 })

    const raw = JSON.parse(stdout) as Record<string, unknown>

    logger.info({ extractor: raw['extractor'] }, 'YouTube: extracted via zeusdl')

    const comments: unknown[] = []
    // zeusdl can fetch comments with --write-comments flag separately
    // We include what's available in the dump

    return {
      url,
      platform: 'youtube',
      data: {
        id: raw['id'],
        title: raw['title'],
        description: raw['description'],
        uploader: raw['uploader'],
        uploader_id: raw['uploader_id'],
        uploader_url: raw['uploader_url'],
        channel: raw['channel'],
        channel_id: raw['channel_id'],
        channel_url: raw['channel_url'],
        channel_follower_count: raw['channel_follower_count'],
        view_count: raw['view_count'],
        like_count: raw['like_count'],
        comment_count: raw['comment_count'],
        duration: raw['duration'],
        duration_string: raw['duration_string'],
        upload_date: raw['upload_date'],
        timestamp: raw['timestamp'],
        thumbnail: raw['thumbnail'],
        thumbnails: raw['thumbnails'],
        tags: raw['tags'],
        categories: raw['categories'],
        age_limit: raw['age_limit'],
        webpage_url: raw['webpage_url'],
        original_url: raw['original_url'],
        playable_in_embed: raw['playable_in_embed'],
        availability: raw['availability'],
        subtitles: raw['subtitles'] ? Object.keys(raw['subtitles'] as object) : [],
        automatic_captions: raw['automatic_captions']
          ? Object.keys(raw['automatic_captions'] as object)
          : [],
        is_live: raw['is_live'],
        was_live: raw['was_live'],
        live_status: raw['live_status'],
        format_id: raw['format_id'],
        ext: raw['ext'],
        fps: raw['fps'],
        width: raw['width'],
        height: raw['height'],
        chapters: raw['chapters'],
        heatmap: raw['heatmap'],
      },
      extracted_by: 'zeusdl',
      duration_ms: 0,
    }
  }

  private async scrapeWithPlaywright(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()
    const context = await this.pool.acquire(session?.cookies)

    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)
      await page.goto(job.url, { waitUntil: 'networkidle' })

      if (job.options.scroll) {
        await page.evaluate(() => window.scrollBy(0, 400))
        await page.waitForTimeout(1000)
      }

      const { data, extracted_by } = await runExtractionPipeline(page, 'youtube', logger, this.aiEngine)

      // Normalize counts
      if (typeof data['view_count'] === 'string') {
        data['view_count'] = normalizeCount(data['view_count'] as string)
      }

      await page.close()
      return { url: job.url, platform: 'youtube', data, extracted_by, duration_ms: 0 }
    } finally {
      await this.pool.release(context)
    }
  }
}
