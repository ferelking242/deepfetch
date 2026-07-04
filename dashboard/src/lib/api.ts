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
export const createKey = (body: CreateKeyBody) =>
  apiFetch<CreatedKey>('/v1/keys', { method: 'POST', body: JSON.stringify(body) })
export const deleteKey = (id: string) => apiFetch<{ message: string }>(`/v1/keys/${id}`, { method: 'DELETE' })
export const whoami = () => apiFetch<WhoamiResult>('/v1/auth/whoami')

// ─── AI Agent — Act / Extract / Observe ──────────────────────────────────────

export const actOnPage = (body: ActRequest) =>
  apiFetch<ActResult>('/v1/act', { method: 'POST', body: JSON.stringify(body) })

export const extractFromPage = (body: ExtractRequest) =>
  apiFetch<ExtractResult>('/v1/extract', { method: 'POST', body: JSON.stringify(body) })

export const observePage = (body: ObserveRequest) =>
  apiFetch<ObserveResult>('/v1/observe', { method: 'POST', body: JSON.stringify(body) })

export const getAgentCacheStats = () =>
  apiFetch<{ total: number; hits: number; description: string }>('/v1/agent/cache')

export const clearAgentCache = () =>
  apiFetch<{ message: string }>('/v1/agent/cache', { method: 'DELETE' })

export const listAgentCache = (limit = 50) =>
  apiFetch<{ entries: AgentCacheEntry[]; count: number }>(`/v1/agent/cache/list?limit=${limit}`)

/** Run agent with SSE streaming. Returns a ReadableStream of AgentEvent. */
export function runAgent(body: AgentRequest): ReadableStream<AgentEvent> {
  const apiKey = localStorage.getItem('deepfetch_api_key') ?? ''
  let controller: ReadableStreamDefaultController<AgentEvent>

  const stream = new ReadableStream<AgentEvent>({
    start(c) { controller = c },
    cancel() { /* handled below */ },
  })

  ;(async () => {
    try {
      const res = await fetch('/v1/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        controller.enqueue({ type: 'error', message: (err as { error: string }).error ?? 'Request failed' })
        controller.close()
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE chunks
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.trim()) continue
          const lines = part.split('\n')
          const dataLine = lines.find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const data = JSON.parse(dataLine.slice(5).trim()) as AgentEvent
            controller.enqueue(data)
          } catch { /* invalid JSON chunk */ }
        }
      }
    } catch (err) {
      controller.enqueue({ type: 'error', message: (err as Error).message })
    } finally {
      try { controller.close() } catch { /* already closed */ }
    }
  })()

  return stream
}

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

export type Scope = 'scrape' | 'crawl' | 'read' | 'admin' | '*'

export interface ApiKeyRow {
  id: string
  label: string
  scopes: Scope[]
  rate_limit_per_minute: number
  expires_at: number | null
  expired: boolean
  created_at: number
  last_used: number | null
}

export interface CreateKeyBody {
  label: string
  scopes?: Scope[]
  rate_limit_per_minute?: number
  expires_in_days?: number
}

export interface CreatedKey {
  id: string
  key: string
  label: string
  scopes: Scope[]
  rate_limit_per_minute: number
  expires_at: number | null
  warning: string
}

export interface WhoamiResult {
  type: 'master' | 'api_key'
  id?: string
  label: string
  scopes: Scope[]
  rate_limit_per_minute: number
  expires_at: number | null
  expired?: boolean
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

// ─── Agent types ──────────────────────────────────────────────────────────────

export interface ActRequest {
  url: string
  instruction: string
  session_id?: string
  use_cache?: boolean
}

export interface ActResult {
  success: boolean
  selector: string
  action_type: string
  value: string | null
  cached: boolean
  reasoning: string
}

export interface ExtractRequest {
  url: string
  instruction: string
  schema?: Record<string, unknown>
  session_id?: string
}

export interface ExtractResult {
  url: string
  data: Record<string, unknown> | null
  instruction: string
}

export interface ObserveRequest {
  url: string
  session_id?: string
}

export interface ObserveResult {
  page_purpose: string
  elements: Array<{
    index: number
    selector: string
    description: string
    action: string
    value_hint: string | null
  }>
  url: string
}

export interface AgentRequest {
  task: string
  tools?: string[]
  max_steps?: number
  session_id?: string
}

export type AgentEvent =
  | { type: 'start';       task: string; tools: string[]; max_steps: number; provider: string }
  | { type: 'step';        index: number; thought: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; index: number; tool: string; result: unknown; duration_ms: number; url?: string }
  | { type: 'done';        result: unknown; summary: string; total_steps: number; duration_ms: number }
  | { type: 'error';       message: string; step?: number }

export interface AgentCacheEntry {
  key: string
  selector: string
  action_type: string
  hit_count: number
  created_at: number
  last_used: number
}
