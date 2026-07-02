import { useState, useEffect, useCallback } from 'react'

export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  interval?: number
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      const result = await fn()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void fetch()
    if (interval) {
      const t = setInterval(() => void fetch(), interval)
      return () => clearInterval(t)
    }
  }, [fetch, interval])

  return { data, loading, error, refetch: fetch }
}
