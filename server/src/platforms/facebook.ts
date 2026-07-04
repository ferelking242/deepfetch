import type { PlatformAdapter, ScrapeContext, ScrapeResult } from '../types/index.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'
import { getConfig } from '../config/loader.js'
import { runExtractionPipeline } from '../extraction/pipeline.js'

export class FacebookAdapter implements PlatformAdapter {
  readonly name = 'facebook'
  readonly domains = [
    'facebook.com', 'www.facebook.com',
    'fb.com', 'www.fb.com',
    'm.facebook.com', 'web.facebook.com',
  ]
  readonly requiresSession = true

  constructor(
    private readonly pool: BrowserPool,
    private readonly aiEngine: AIEngine,
    private readonly logger: Logger
  ) {}

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^web\./, '')
      return hostname === 'facebook.com' || hostname === 'fb.com'
    } catch {
      return false
    }
  }

  async scrape(ctx: ScrapeContext): Promise<ScrapeResult> {
    const { job, session, logger } = ctx
    const cfg = getConfig()
    const start = Date.now()

    // Public fallback: Jina Reader (works for public posts / pages without login)
    if (!session) {
      try {
        const jinaUrl = `https://r.jina.ai/${encodeURIComponent(job.url)}`
        const res = await fetch(jinaUrl, {
          headers: { 'Accept': 'application/json', 'X-Return-Format': 'json' },
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          logger.info('Facebook: extracted via Jina Reader (public, no session)')
          return {
            url: job.url,
            platform: 'facebook',
            data,
            extracted_by: 'selectors',
            duration_ms: Date.now() - start,
          }
        }
      } catch (err) {
        logger.debug({ err }, 'Facebook: Jina Reader failed, falling back to Playwright')
      }
    }

    // Playwright with optional session cookies
    const context = await this.pool.acquire(session ? { cookies: session.cookies } : {})
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(cfg.browser.navigation_timeout_ms)

      // Anti-detection: realistic viewport + user-agent already set by stealth plugin
      await page.goto(job.url, { waitUntil: 'domcontentloaded' })

      // Wait for main content to render
      await page.waitForTimeout(2500)

      // Dismiss cookie/login dialogs if present
      for (const selector of [
        '[data-testid="cookie-policy-manage-dialog-accept-button"]',
        'button[title="Accept all"]',
        '[aria-label="Close"]',
        'div[role="dialog"] button:first-of-type',
      ]) {
        await page.locator(selector).first().click({ timeout: 2000 }).catch(() => null)
      }

      if (job.options.scroll) {
        await this.autoScroll(page)
      }

      // Extract structured data from Facebook's internal JSON blobs (window.__bbox, __data)
      const inlineData = await this.extractInlineData(page)

      const { data: pipelineData, extracted_by } = await runExtractionPipeline(
        page, 'facebook', logger, this.aiEngine
      )

      // Extract post/comments if requested
      const comments: unknown[] = []
      if ((job.options.max_comments ?? 0) > 0) {
        const extracted = await this.extractComments(page, job.options.max_comments ?? 20)
        comments.push(...extracted)
      }

      const data: Record<string, unknown> = {
        ...pipelineData,
        ...(Object.keys(inlineData).length ? { _inline: inlineData } : {}),
        ...(comments.length ? { comments } : {}),
      }

      await page.close()
      return {
        url: job.url,
        platform: 'facebook',
        data,
        extracted_by,
        duration_ms: Date.now() - start,
      }
    } finally {
      await this.pool.release(context)
    }
  }

  /**
   * Extract data from Facebook's internal JS blobs:
   * window.__bbox.define / require, window._sharedData, __data
   */
  private async extractInlineData(page: import('playwright').Page): Promise<Record<string, unknown>> {
    return page.evaluate(() => {
      const result: Record<string, unknown> = {}

      // Method 1: window.__data (newer FB)
      try {
        const el = document.querySelector('script[type="application/json"]')
        if (el?.textContent) {
          const parsed = JSON.parse(el.textContent) as Record<string, unknown>
          if (parsed && typeof parsed === 'object') {
            Object.assign(result, parsed)
          }
        }
      } catch { /* skip */ }

      // Method 2: all JSON-LD structured data
      try {
        const jsonLds = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        const schemas = jsonLds.flatMap(el => {
          try { return [JSON.parse(el.textContent ?? '')] } catch { return [] }
        })
        if (schemas.length) result['schema_org'] = schemas
      } catch { /* skip */ }

      // Method 3: OG meta tags (always available for public pages)
      try {
        const og: Record<string, string> = {}
        document.querySelectorAll('meta[property^="og:"], meta[name^="og:"]').forEach(el => {
          const prop = el.getAttribute('property') ?? el.getAttribute('name') ?? ''
          const content = el.getAttribute('content') ?? ''
          if (prop && content) og[prop.replace('og:', '')] = content
        })
        if (Object.keys(og).length) result['og'] = og
      } catch { /* skip */ }

      return result
    })
  }

  private async extractComments(page: import('playwright').Page, max: number): Promise<unknown[]> {
    return page.evaluate((max: number) => {
      const comments: Array<{author: string|null; text: string|null; published_at: string|null}> = []

      // Facebook comment selectors (various FB layouts)
      const selectors = [
        '[data-testid="UFI2Comment/root_depth_0"]',
        'div[role="article"] div[data-ft]',
        'ul li[data-testid]',
      ]

      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel)).slice(0, max)
        if (!els.length) continue
        for (const el of els) {
          comments.push({
            author: el.querySelector('a span')?.textContent?.trim() ?? null,
            text: el.querySelector('div[data-testid="comment-body"] span')?.textContent?.trim()
              ?? el.querySelector('span[dir="auto"]')?.textContent?.trim()
              ?? null,
            published_at: el.querySelector('abbr, time')?.getAttribute('data-utime')
              ?? el.querySelector('time')?.getAttribute('datetime')
              ?? null,
          })
        }
        if (comments.length) break
      }

      return comments
    }, max)
  }

  private async autoScroll(page: import('playwright').Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        let total = 0
        const timer = setInterval(() => {
          window.scrollBy(0, 400)
          total += 400
          if (total >= Math.min(document.body.scrollHeight - window.innerHeight, 8000)) {
            clearInterval(timer)
            resolve()
          }
        }, 200)
      })
    })
    await page.waitForTimeout(800)
  }
}
