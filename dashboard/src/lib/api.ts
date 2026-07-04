const BASE = ''

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const apiKey = localStorage.getItem('deepfetch_api_key') ?? ''
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

// ─── Health ──────────────────────────────────────────────────────────────────
export const health = () => apiFetch<SystemHealth>('/v1/health')
export const platforms = () => apiFetch<{ platforms: Platform[] }>('/v1/platforms')

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const listJobs = (params?: { status?: string; limit?: number }) => {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.limit) q.set('limit', String(params.limit))
  return apiFetch<{ jobs: Job[]; count: number }>(`/v1/jobs?${q}`)
}
export const getJob = (id: string) => apiFetch<Job>(`/v1/jobs/${id}`)
export const cancelJob = (id: string) => apiFetch<{ message: string }>(`/v1/jobs/${id}`, { method: 'DELETE' })

export const scrape = (body: ScrapeRequest) =>
  apiFetch<ScrapeResponse>('/v1/scrape', { method: 'POST', body: JSON.stringify(body) })

// ─── Crawl ────────────────────────────────────────────────────────────────────
export const crawl = (body: CrawlRequest) =>
  apiFetch<CrawlResponse>('/v1/crawl', { method: 'POST', body: JSON.stringify(body) })

// ─── Batch ────────────────────────────────────────────────────────────────────
export const batch = (body: BatchRequest) =>
  apiFetch<BatchResponse>('/v1/batch', { method: 'POST', body: JSON.stringify(body) })

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const listSessions = () => apiFetch<{ sessions: SessionSummary[] }>('/v1/sessions')
export const createSessionCredentials = (body: CreateCredSession) =>
  apiFetch<{ id: string }>('/v1/sessions', { method: 'POST', body: JSON.stringify(body) })
export const checkSession = (id: string) => apiFetch<{ id: string; valid: boolean; status: string }>(`/v1/sessions/${id}/check`)
export const deleteSession = (id: string) => apiFetch<{ message: string }>(`/v1/sessions/${id}`, { method: 'DELETE' })

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const listKeys = () => apiFetch<{ keys: ApiKeyRow[] }>('/v1/keys')
export const createKey = (body: { label: string; rate_limit_per_minute?: number }) =>
  apiFetch<{ id: string; key: string; label: string; warning: string }>('/v1/keys', { method: 'POST', body: JSON.stringify(body) })
export const deleteKey = (id: string) => apiFetch<{ message: string }>(`/v1/keys/${id}`, { method: 'DELETE' })

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SystemHealth {
  status: 'ok' | 'degraded' | 'overloaded'
  cpu_pct: number
  ram_pct: number
  ram_used_gb: number
  ram_total_gb: number
  pool_size: number
  pool_active: number
  pool_max: number
  queue_depth: number
  queue_running: number
  uptime_seconds: number
}

export interface Platform { name: string; domains: string[]; requiresSession: boolean }

export interface Job {
  id: string
  url: string
  platform: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  priority: 'high' | 'normal' | 'batch'
  error: string | null
  retries: number
  created_at: number
  started_at: number | null
  finished_at: number | null
  result: { data: Record<string, unknown>; extracted_by: string; duration_ms: number } | null
}

export interface SessionSummary {
  id: string
  platform: string
  label: string
  status: 'active' | 'expired' | 'invalid'
  has_credentials: boolean
  cookie_count: number
  last_checked: number
  created_at: number
}

export interface ApiKeyRow {
  id: string
  label: string
  rate_limit_per_minute: number
  created_at: number
  last_used: number | null
}

export interface ScrapeRequest {
  url: string
  session_id?: string
  priority?: 'high' | 'normal' | 'batch'
  sync?: boolean
  output?: string[]
  options?: {
    max_comments?: number
    scroll?: boolean
    wait_for?: string
    timeout_ms?: number
    actions?: BrowserAction[]
  }
}
export interface ScrapeResponse { job_id: string; status: string; platform?: string }

export interface CrawlRequest {
  url: string
  depth?: number
  limit?: number
  same_domain?: boolean
  exclude_patterns?: string[]
  output?: string[]
  priority?: 'high' | 'normal' | 'batch'
}
export interface CrawlResponse { job_id: string; seed_url: string; config: Record<string, unknown>; message: string }

export interface BatchRequest {
  urls: string[]
  session_id?: string
  priority?: 'high' | 'normal' | 'batch'
  output?: string[]
  options?: { max_comments?: number; scroll?: boolean; timeout_ms?: number }
}
export interface BatchResponse { job_ids: string[]; count: number; message: string }

export interface BrowserAction {
  type: 'fill' | 'click' | 'wait_for_url' | 'wait_for_selector' | 'select'
  selector?: string
  value?: string
  pattern?: string
}

export interface CreateCredSession {
  type: 'credentials'
  platform: string
  username: string
  password: string
  label?: string
}
