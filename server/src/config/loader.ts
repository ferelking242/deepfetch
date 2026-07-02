import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { AppConfig } from '../types/index.js'

const DEFAULTS: AppConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    master_secret: 'change-me',
  },
  browser: {
    pool_max: 0,
    pool_reserved: 1,
    context_ttl_seconds: 300,
    navigation_timeout_ms: 30000,
    headless: true,
  },
  resources: {
    cpu_threshold_pct: 85,
    ram_threshold_pct: 80,
  },
  queue: {
    max_retries: 3,
    retry_base_delay_ms: 2000,
    result_ttl_seconds: 86400,
  },
  ai_engine: {
    enabled: true,
    trigger: 'on_selector_failure',
    max_html_chars: 50000,
    timeout_ms: 15000,
    providers: [
      { name: 'ollama', local: true, model: 'llama3.2', base_url: 'http://localhost:11434' },
    ],
  },
  zeusdl: {
    binary: 'zeusdl',
    extra_flags: [],
  },
  sessions: {
    encryption_key: '',
    check_interval_seconds: 1800,
  },
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && typeof base[key] === 'object') {
      result[key] = deepMerge(base[key] as object, val as object) as T[keyof T]
    } else if (val !== undefined) {
      result[key] = val as T[keyof T]
    }
  }
  return result
}

function applyEnvOverrides(cfg: AppConfig): AppConfig {
  if (process.env.PORT)              cfg.server.port = parseInt(process.env.PORT)
  if (process.env.HOST)              cfg.server.host = process.env.HOST
  if (process.env.MASTER_SECRET)     cfg.server.master_secret = process.env.MASTER_SECRET
  if (process.env.SESSION_ENC_KEY)   cfg.sessions.encryption_key = process.env.SESSION_ENC_KEY
  if (process.env.ZEUSDL_BINARY)     cfg.zeusdl.binary = process.env.ZEUSDL_BINARY
  if (process.env.DEEPFETCH_HEADLESS === 'false') cfg.browser.headless = false

  // AI provider keys from env
  for (const p of cfg.ai_engine.providers) {
    const envMap: Record<string, string> = {
      openai:    'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini:    'GOOGLE_GENERATIVE_AI_API_KEY',
      groq:      'GROQ_API_KEY',
      mistral:   'MISTRAL_API_KEY',
      deepseek:  'DEEPSEEK_API_KEY',
      xai:       'XAI_API_KEY',
    }
    const envKey = envMap[p.name]
    if (envKey && process.env[envKey]) {
      p.api_key = process.env[envKey]
    }
  }

  return cfg
}

let _config: AppConfig | null = null

export function loadConfig(configPath?: string): AppConfig {
  if (_config) return _config

  const cfgPath = configPath ?? path.join(process.cwd(), 'config.yaml')

  let fileConfig: Partial<AppConfig> = {}
  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, 'utf-8')
    fileConfig = yaml.load(raw) as Partial<AppConfig>
  }

  _config = applyEnvOverrides(deepMerge(DEFAULTS, fileConfig))
  return _config
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig()
  return _config
}
