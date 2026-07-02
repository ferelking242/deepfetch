import type { ScrapeResult } from '../types/index.js'

export function toJson(result: ScrapeResult): string {
  return JSON.stringify({
    url: result.url,
    platform: result.platform,
    extracted_by: result.extracted_by,
    duration_ms: result.duration_ms,
    data: result.data,
  }, null, 2)
}
