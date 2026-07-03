import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
  import type { BrowserPool } from '../core/BrowserPool.js'
  import type { AIEngine } from '../ai/AIEngine.js'
  import type { Logger } from 'pino'
  import { getConfig } from '../config/loader.js'
  import { runExtractionPipeline } from '../extraction/pipeline.js'

  export class RedditAdapter implements PlatformAdapter {
    readonly name = 'reddit'
    readonly domains = ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com']
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
      const { job, session, logger } = ctx

      if (!session) {
        try {
          const result = await this.scrapeViaApi(job.url, job.options.max_comments ?? 20, logger)
          if (result) return result
        } catch (err) {
          logger.warn({ err }, 'Reddit: public API failed, falling back to Playwright')
        }
      }

      return this.scrapeWithPlaywright(ctx)
    }

    private async scrapeViaApi(
      url: string,
      maxComments: number,
      logger: Logger
    ): Promise<ScrapeResult | null> {
      const apiUrl = url
        .replace(/\?.*$/, '')
        .replace(/\/$/, '') + '.json?limit=' + maxComments

      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'DeepFetch/1.0 (self-hosted scraper)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) return null

      const json = await res.json() as unknown[]
      if (!Array.isArray(json) || json.length < 2) return null

      const postListing = json[0] as { data: { children: Array<{ data: Record<string, unknown> }> } }
      const commentListing = json[1] as { data: { children: Array<{ data: Record<string, unknown> }> } }

      const post = postListing.data.children[0]?.data
      if (!post) return null

      const comments = commentListing.data.children
        .filter(c => c.data.body)
        .slice(0, maxComments)
        .map(c => {
          const repliesData = (c.data.replies as Record<string, unknown>)
          const repliesChildren = (repliesData?.['data'] as Record<string, unknown>)?.['children']
          const repliesCount = Array.isArray(repliesChildren)
            ? (repliesChildren as unknown[]).length
            : 0
          return {
            id: c.data.name,
            author: c.data.author,
            body: c.data.body,
            score: c.data.score,
            created_utc: c.data.created_utc,
            is_submitter: c.data.is_submitter,
            replies_count: repliesCount,
          }
        })

      logger.info({ post_id: post['id'], comments: comments.length }, 'Reddit: extracted via public API')

      return {
        url,
        platform: 'reddit',
        data: {
          id: post['id'],
          title: post['title'],
          selftext: post['selftext'],
          author: post['author'],
          subreddit: post['subreddit'],
          subreddit_prefixed: post['subreddit_name_prefixed'],
          score: post['score'],
          upvote_ratio: post['upvote_ratio'],
          num_comments: post['num_comments'],
          url: post['url'],
          permalink: 'https://www.reddit.com' + (post['permalink'] as string),
          thumbnail: post['thumbnail'],
          preview: post['preview'],
          created_utc: post['created_utc'],
          is_self: post['is_self'],
          link_flair_text: post['link_flair_text'],
          awards: post['all_awardings'],
          crosspost_parent: post['crosspost_parent'],
          comments,
        },
        extracted_by: 'selectors',
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

        const { data, extracted_by } = await runExtractionPipeline(page, 'reddit', logger, this.aiEngine)

        await page.close()
        return { url: job.url, platform: 'reddit', data, extracted_by, duration_ms: 0 }
      } finally {
        await this.pool.release(context)
      }
    }
  }
  