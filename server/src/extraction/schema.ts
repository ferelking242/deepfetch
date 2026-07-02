import { z } from 'zod'

/** Validate and normalize a scrape result — throws if schema is violated */
export function validateResult<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  strict = false
): z.infer<T> {
  if (strict) {
    return schema.parse(data)
  }
  // Soft parse — fill missing fields with null
  const result = schema.safeParse(data)
  if (result.success) return result.data

  // Attempt to fill missing nullable fields
  if (data && typeof data === 'object') {
    return result.data ?? data
  }

  return data as z.infer<T>
}

/** Check if an extraction result is empty (all null/empty) */
export function isEmpty(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return true
  const values = Object.values(data).filter(v => v !== null && v !== undefined && v !== '')
  return values.length === 0
}

/** Merge two extraction results — later values win if non-null */
export function mergeResults(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base }
  for (const [k, v] of Object.entries(override)) {
    if (v !== null && v !== undefined && v !== '') {
      result[k] = v
    }
  }
  return result
}

/** Normalize counts — parse "1.2M" → 1200000, "4K" → 4000, etc. */
export function normalizeCount(raw: string | null | undefined): number | null {
  if (!raw) return null
  const clean = raw.replace(/,/g, '').trim()
  const multipliers: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }

  for (const [suffix, mult] of Object.entries(multipliers)) {
    if (clean.toUpperCase().endsWith(suffix)) {
      const num = parseFloat(clean.slice(0, -1))
      return isNaN(num) ? null : Math.round(num * mult)
    }
  }

  const num = parseInt(clean, 10)
  return isNaN(num) ? null : num
}
