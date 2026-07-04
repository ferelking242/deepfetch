// ─── Core Domain Types ──────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type JobPriority = 'high' | 'normal' | 'batch'
export type OutputFormat = 'json' | 'markdown' | 'html' | 'screenshot'
export type ExtractionTrigger = 'on_selector_failure' | 'always' | 'never'

// ─── Browser Actions ─────────────────────────────────────────────────────────

/** Interaction */
export type ActionClick          = { type: 'click';          selector: string; button?: 'left' | 'right' | 'middle'; count?: number; delay?: number }
export type ActionFill           = { type: 'fill';           selector: string; value: string }
export type ActionType           = { type: 'type';           selector: string; text: string; delay?: number }
export type ActionPress          = { type: 'press';          key: string; modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[] }
export type ActionSelect         = { type: 'select';         selector: string; value: string | string[] }
export type ActionCheck          = { type: 'check';          selector: string }
export type ActionUncheck        = { type: 'uncheck';        selector: string }
export type ActionFocus          = { type: 'focus';          selector: string }
export type ActionClear          = { type: 'clear';          selector: string }
export type ActionHover          = { type: 'hover';          selector: string }
export type ActionDrag           = { type: 'drag';           source: string; target: string }
export type ActionUploadFile     = { type: 'upload_file';    selector: string; files: string[] }  // base64 data URIs or http URLs

/** Navigation */
export type ActionGoto           = { type: 'goto';           url: string; wait_until?: 'load' | 'domcontentloaded' | 'networkidle' }
export type ActionGoBack         = { type: 'go_back' }
export type ActionGoForward      = { type: 'go_forward' }
export type ActionReload         = { type: 'reload';         wait_until?: 'load' | 'domcontentloaded' | 'networkidle' }

/** Wait */
export type ActionWait           = { type: 'wait';           ms: number }
export type ActionWaitSelector   = { type: 'wait_for_selector';   selector: string; state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }
export type ActionWaitUrl        = { type: 'wait_for_url';        pattern: string; timeout?: number }
export type ActionWaitLoadState  = { type: 'wait_for_load_state'; state?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }
export type ActionWaitFunction   = { type: 'wait_for_function';   expression: string; timeout?: number }
export type ActionWaitResponse   = { type: 'wait_for_response';   url_pattern: string; timeout?: number; as?: string }

/** Scroll */
export type ActionScroll         = { type: 'scroll';         selector?: string; x?: number; y?: number }
export type ActionScrollBottom   = { type: 'scroll_to_bottom'; max_height?: number; step?: number; delay_ms?: number }

/** Viewport / Environment */
export type ActionSetViewport    = { type: 'set_viewport';   width: number; height: number }
export type ActionSetGeo         = { type: 'set_geolocation'; latitude: number; longitude: number; accuracy?: number }
export type ActionEmulateDevice  = { type: 'emulate_device'; device: 'mobile' | 'tablet' | 'desktop' }

/** JavaScript */
export type ActionEvaluate       = { type: 'evaluate';       expression: string; as?: string }
export type ActionSetStorage     = { type: 'set_local_storage'; key: string; value: string }
export type ActionSetCookie      = { type: 'set_cookie';     name: string; value: string; domain?: string; path?: string; secure?: boolean }
export type ActionClearCookies   = { type: 'clear_cookies' }

/** Mid-action Capture */
export type ActionScreenshot     = { type: 'screenshot';     selector?: string; full_page?: boolean; as?: string }
export type ActionGetText        = { type: 'get_text';       selector: string; as?: string }
export type ActionGetAttribute   = { type: 'get_attribute';  selector: string; attribute: string; as?: string }
export type ActionGetValue       = { type: 'get_value';      selector: string; as?: string }

/** Network */
export type ActionBlockResources = { type: 'block_resources'; resource_types: ('image' | 'font' | 'media' | 'stylesheet')[] }
export type ActionSetHeaders     = { type: 'set_headers';    headers: Record<string, string> }

/** Anti-bot / CAPTCHA */
export type ActionSolveCaptcha   = { type: 'solve_captcha';  variant?: 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'cloudflare' | 'auto' }
export type ActionHumanizeMouse  = { type: 'humanize_mouse'; selector: string; jitter?: number }

export type BrowserAction =
  | ActionClick | ActionFill | ActionType | ActionPress | ActionSelect
  | ActionCheck | ActionUncheck | ActionFocus | ActionClear | ActionHover
  | ActionDrag | ActionUploadFile
  | ActionGoto | ActionGoBack | ActionGoForward | ActionReload
  | ActionWait | ActionWaitSelector | ActionWaitUrl | ActionWaitLoadState
  | ActionWaitFunction | ActionWaitResponse
  | ActionScroll | ActionScrollBottom
  | ActionSetViewport | ActionSetGeo | ActionEmulateDevice
  | ActionEvaluate | ActionSetStorage | ActionSetCookie | ActionClearCookies
  | ActionScreenshot | ActionGetText | ActionGetAttribute | ActionGetValue
  | ActionBlockResources | ActionSetHeaders
  | ActionSolveCaptcha | ActionHumanizeMouse

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
  action_results?: Record<string, unknown>  // named results from get_text / evaluate / etc.
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
  canHandle(url: string): boolean
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
