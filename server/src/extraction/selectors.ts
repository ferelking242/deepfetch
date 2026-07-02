import type { Page } from 'playwright'
import type { Logger } from 'pino'

export interface SelectorSet {
  [field: string]: string | string[]  // string[] = try selectors in order (chain fallback)
}

// ─── Per-platform selector maps ──────────────────────────────────────────────

export const SELECTORS: Record<string, SelectorSet> = {
  youtube: {
    title:         ['h1.ytd-watch-metadata yt-formatted-string', '#title h1', 'h1.title'],
    description:   ['#description-text', '#snippet #description', 'ytd-text-inline-expander'],
    author:        ['#channel-name a', '#owner-name a', 'ytd-channel-name a'],
    view_count:    ['#view-count span:first-child', '.view-count', 'ytd-video-view-count-renderer span'],
    like_count:    ['ytd-toggle-button-renderer:first-child #text', 'yt-smartimation[aria-label*="like"] span'],
    published_at:  ['#info-strings yt-formatted-string', '#date yt-formatted-string'],
    thumbnail:     ['link[itemprop="thumbnailUrl"]', 'meta[property="og:image"]'],
  },

  tiktok: {
    title:         ['[data-e2e="browse-video-desc"]', 'h1[data-e2e="video-desc"]', '.video-meta-title'],
    author:        ['[data-e2e="browser-nickname"]', '[data-e2e="video-author-uniqueid"]'],
    like_count:    ['[data-e2e="browse-like-count"]', '[data-e2e="like-count"]'],
    comment_count: ['[data-e2e="browse-comment-count"]', '[data-e2e="comment-count"]'],
    share_count:   ['[data-e2e="share-count"]'],
    music:         ['[data-e2e="browse-music"]', '.music-title-decoration'],
  },

  instagram: {
    title:         ['meta[property="og:title"]'],
    description:   ['meta[property="og:description"]', 'meta[name="description"]'],
    author:        ['meta[property="og:site_name"]', 'header h1', 'header h2'],
    like_count:    ['section span[class*="like"]', 'button[aria-label*="like"] span'],
    thumbnail:     ['meta[property="og:image"]'],
  },

  reddit: {
    title:         ['h1[data-testid="post-title"]', 'h1', 'shreddit-post h1'],
    author:        ['[data-testid="post_author_link"]', 'a[data-click-id="user"]'],
    vote_count:    ['[data-testid="vote-arrows"] div[dir]', 'shreddit-post faceplate-number'],
    comment_count: ['[data-testid="comment-count"]', 'a[data-click-id="comments"] span'],
    subreddit:     ['[data-testid="subreddit-link"]', 'a[data-click-id="subreddit"]'],
    published_at:  ['time', 'faceplate-timeago time'],
  },

  generic: {
    title:         ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title', 'h1'],
    description:   ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'],
    author:        ['meta[name="author"]', '[rel="author"]', '.author', '.byline'],
    published_at:  ['meta[property="article:published_time"]', 'time[datetime]', '.date', '.published'],
    thumbnail:     ['meta[property="og:image"]', 'meta[name="twitter:image"]'],
    canonical_url: ['link[rel="canonical"]'],
  },
}

type AttrSelector = { selector: string; attr: string }

const ATTR_SELECTORS: Record<string, Record<string, AttrSelector>> = {
  generic: {
    title:         { selector: 'meta[property="og:title"]', attr: 'content' },
    description:   { selector: 'meta[property="og:description"]', attr: 'content' },
    thumbnail:     { selector: 'meta[property="og:image"]', attr: 'content' },
    canonical_url: { selector: 'link[rel="canonical"]', attr: 'href' },
    published_at:  { selector: 'meta[property="article:published_time"]', attr: 'content' },
  },
}

export async function runSelectors(
  page: Page,
  platform: string,
  logger: Logger
): Promise<Record<string, string | null>> {
  const selectorMap = SELECTORS[platform] ?? SELECTORS.generic
  const attrMap = ATTR_SELECTORS[platform] ?? ATTR_SELECTORS.generic

  const result: Record<string, string | null> = {}

  for (const [field, selectors] of Object.entries(selectorMap)) {
    const chain = Array.isArray(selectors) ? selectors : [selectors]
    let value: string | null = null

    for (const sel of chain) {
      try {
        // Check if this field has an attribute selector
        const attrDef = attrMap?.[field]
        if (attrDef && sel === attrDef.selector) {
          const el = page.locator(sel).first()
          value = await el.getAttribute(attrDef.attr, { timeout: 2000 }).catch(() => null)
        } else {
          const el = page.locator(sel).first()
          value = await el.textContent({ timeout: 2000 }).catch(() => null)
          value = value?.trim() ?? null
        }

        if (value) break
      } catch {
        continue
      }
    }

    result[field] = value
  }

  const found = Object.values(result).filter(Boolean).length
  logger.debug({ platform, found, total: Object.keys(result).length }, 'Selectors extracted')

  return result
}
