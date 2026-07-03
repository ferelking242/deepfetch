// ─── Core Domain Types ──────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type JobPriority = 'high' | 'normal' | 'batch'
export type OutputFormat = 'json' | 'markdown' | 'html' | 'screenshot'
export type ExtractionTrigger = 'on_selector_failure' | 'always' | 'never'

// ─── Job ────────────────────────────────────────────────────────────────────

export interface Job {
  id: string
  url: string
  platform: string
  status: JobStatus
  priority: JobPriority
  session_id: string | null
  options: ScrapeOptions
  result: ScrapeResult | null
  error: string | null
  retries: number
  created_at: number
  started_at: number | null
  finished_at: number | null
}

export type BrowserAction =
  | { type: 'fill'; selector: string; value: string }
  | { type: 'click'; selector: string }
  | { type: 'wait_for_url'; pattern: string }
  | { type: 'wait_for_selector'; selector: string }
  | { type: 'select'; selector: string; value: string }

export interface ScrapeOptions {
  output: OutputFormat[]
  extract?: string[]
  max_comments?: number
  scroll?: boolean
  wait_for?: string
  timeout_ms?: number
  crawl_depth?: number
  crawl_limit?: number
  actions?: BrowserAction[]
}

export interface ScrapeResult {
  url: string
  platform: string
  data: Record<string, unknown>
  markdown?: string
  html?: string
  screenshot_path?: string
  extracted_by: 'selectors' | 'blob' | 'ai' | 'zeusdl'
  duration_ms: number
}

// ─── Session ────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  platform: string
  label: string
  cookies: CookieEntry[]
  credentials: Credentials | null
  status: 'active' | 'expired' | 'invalid'
  last_checked: number
  created_at: number
}

export interface CookieEntry {
  name: string
  value: string
  domain: string
  path: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

export interface Credentials {
  username: string
  password: string // AES-256 encrypted
}

// ─── API Key ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  key_hash: string
  label: string
  rate_limit_per_minute: number
  created_at: number
  last_used: number | null
}

// ─── System Health ───────────────────────────────────────────────────────────

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

// ─── Platform Adapter Interface ───────────────────────────────────────────────

export interface PlatformAdapter {
  name: string
  domains: string[]
  requiresSession: boolean

  /** Test if this adapter can handle the given URL */
  canHandle(url: string): boolean

  /** Perform the full scrape for this platform */
  scrape(ctx: ScrapeContext): Promise<ScrapeResult>
}

export interface ScrapeContext {
  job: Job
  session: Session | null
  logger: import('pino').Logger
}

// ─── AI Engine ───────────────────────────────────────────────────────────────

export interface AIProviderConfig {
  name: string
  api_key?: string
  model: string
  local?: boolean
  base_url?: string
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface AppConfig {
  server: {
    port: number
    host: string
    master_secret: string
  }
  browser: {
    pool_max: number
    pool_reserved: number
    context_ttl_seconds: number
    navigation_timeout_ms: number
    headless: boolean
  }
  resources: {
    cpu_threshold_pct: number
    ram_threshold_pct: number
  }
  queue: {
    max_retries: number
    retry_base_delay_ms: number
    result_ttl_seconds: number
  }
  ai_engine: {
    enabled: boolean
    trigger: ExtractionTrigger
    max_html_chars: number
    timeout_ms: number
    providers: AIProviderConfig[]
  }
  zeusdl: {
    binary: string
    extra_flags: string[]
  }
  sessions: {
    encryption_key: string
    check_interval_seconds: number
  }
}
