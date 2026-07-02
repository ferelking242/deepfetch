import type { Page } from 'playwright'
import type { Logger } from 'pino'
import { runSelectors } from './selectors.js'
import { extractDataBlobs } from './dataBlobs.js'
import { mergeResults, isEmpty } from './schema.js'
import { AIEngine, VideoPageSchema, GenericPageSchema } from '../ai/AIEngine.js'
import { getConfig } from '../config/loader.js'
import type { ScrapeResult } from '../types/index.js'

export interface PipelineResult {
  data: Record<string, unknown>
  extracted_by: ScrapeResult['extracted_by']
}

export async function runExtractionPipeline(
  page: Page,
  platform: string,
  logger: Logger,
  aiEngine: AIEngine
): Promise<PipelineResult> {
  const cfg = getConfig()
  let data: Record<string, unknown> = {}
  let extracted_by: ScrapeResult['extracted_by'] = 'selectors'

  // ── Level 1: CSS Selectors ─────────────────────────────────────────────────
  const selectorData = await runSelectors(page, platform, logger)
  if (!isEmpty(selectorData)) {
    data = mergeResults(data, selectorData)
  }

  // ── Level 2: Data blobs (window.__data__ etc.) ────────────────────────────
  const blobData = await extractDataBlobs(page, platform, logger)
  if (blobData && !isEmpty(blobData)) {
    extracted_by = 'blob'
    data = mergeResults(data, blobData)
  }

  // ── Level 3: AI Engine ────────────────────────────────────────────────────
  const shouldUseAI =
    cfg.ai_engine.trigger === 'always' ||
    (cfg.ai_engine.trigger === 'on_selector_failure' && isEmpty(data))

  if (shouldUseAI && aiEngine.isEnabled()) {
    logger.info('Selector + blob extraction insufficient, trying AI Engine')
    const html = await page.content()

    // Choose schema based on platform
    const schema = ['youtube', 'tiktok', 'instagram', 'twitter'].includes(platform)
      ? VideoPageSchema
      : GenericPageSchema

    const aiData = await aiEngine.extract(html, schema, `Platform: ${platform}, URL: ${page.url()}`)
    if (aiData && !isEmpty(aiData)) {
      extracted_by = 'ai'
      data = mergeResults(data, aiData)
    }
  }

  return { data, extracted_by }
}
