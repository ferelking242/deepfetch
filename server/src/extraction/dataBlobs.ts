import type { Page } from 'playwright'
import type { Logger } from 'pino'

/**
 * Extract data blobs injected by the site into window.* globals.
 * These are far more reliable than CSS selectors because they're the source of truth
 * the site itself uses to render its UI.
 */
export async function extractDataBlobs(page: Page, platform: string, logger: Logger): Promise<Record<string, unknown> | null> {
  try {
    switch (platform) {
      case 'youtube':   return await extractYouTubeBlob(page)
      case 'tiktok':    return await extractTikTokBlob(page)
      case 'instagram': return await extractInstagramBlob(page)
      case 'reddit':    return await extractRedditBlob(page)
      case 'twitter':   return await extractTwitterBlob(page)
      default:          return await extractGenericBlob(page)
    }
  } catch (err) {
    logger.debug({ err, platform }, 'Data blob extraction failed')
    return null
  }
}

async function extractYouTubeBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const init = (window as unknown as Record<string, unknown>)['ytInitialData'] as Record<string, unknown> | undefined
    const playerInit = (window as unknown as Record<string, unknown>)['ytInitialPlayerResponse'] as Record<string, unknown> | undefined
    if (!init) return null

    // Navigate ytInitialData to find videoDetails
    try {
      const contents = (init?.contents as Record<string, unknown>)
      return {
        __source: 'ytInitialData',
        raw_init: init,
        raw_player: playerInit ?? null,
      }
    } catch {
      return { __source: 'ytInitialData', raw_init: init }
    }
  })
}

async function extractTikTokBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    // TikTok injects __UNIVERSAL_DATA_FOR_REHYDRATION__ or __INITIAL_STATE__
    const rehydration = (window as unknown as Record<string, unknown>)['__UNIVERSAL_DATA_FOR_REHYDRATION__']
    const initial = (window as unknown as Record<string, unknown>)['__INITIAL_STATE__']

    const source = rehydration ?? initial
    if (!source) return null

    return {
      __source: rehydration ? '__UNIVERSAL_DATA_FOR_REHYDRATION__' : '__INITIAL_STATE__',
      raw: source,
    }
  })
}

async function extractInstagramBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    // Instagram uses shared_data or additional_data
    const shared = (window as unknown as Record<string, unknown>)['_sharedData']
    const additional = (window as unknown as Record<string, unknown>)['__additionalData']

    // Also try to find JSON in script tags
    const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'))
    const scriptData = scripts.map(s => {
      try { return JSON.parse(s.textContent ?? '') } catch { return null }
    }).filter(Boolean)

    return {
      __source: 'instagram_blobs',
      shared_data: shared ?? null,
      additional_data: additional ?? null,
      script_data: scriptData.slice(0, 3),
    }
  })
}

async function extractRedditBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const data = (window as unknown as Record<string, unknown>)['__r']
    const redux = (window as unknown as Record<string, unknown>)['__APOLLO_STATE__']
    if (!data && !redux) return null
    return {
      __source: 'reddit_blobs',
      r_data: data ?? null,
      apollo: redux ?? null,
    }
  })
}

async function extractTwitterBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    // Twitter/X injects __NEXT_DATA__
    const nextData = (window as unknown as Record<string, unknown>)['__NEXT_DATA__']
    if (!nextData) return null
    return { __source: '__NEXT_DATA__', raw: nextData }
  })
}

async function extractGenericBlob(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    // Common patterns for SPA data injection
    const candidates = [
      '__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__APP_STATE__',
      '__PRELOADED_STATE__', 'window.__data', '__remixContext',
    ]
    const found: Record<string, unknown> = {}

    for (const key of candidates) {
      const val = (window as unknown as Record<string, unknown>)[key]
      if (val) found[key] = val
    }

    // Look for application/ld+json structured data
    const ldJson = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => { try { return JSON.parse(s.textContent ?? '') } catch { return null } })
      .filter(Boolean)

    if (ldJson.length) found['ld_json'] = ldJson

    return Object.keys(found).length ? { __source: 'generic_blobs', ...found } : null
  })
}
