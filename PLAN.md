# DeepFetch — Architecture Plan

> Universal web scraping & automation engine. Self-hosted, API-first, stealth-ready.  
> Stack: Node.js 22 · TypeScript · Fastify · Playwright · SQLite · React

---

## Vision

A local server that exposes a clean REST + WebSocket API, capable of scraping and automating any website — with authenticated sessions, an adaptive browser pool that never exceeds hardware limits, a multi-provider AI Extraction Engine, and a React control dashboard. Mobile and third-party clients consume the API only.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       DEEPFETCH SERVER                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                API GATEWAY (Fastify)                        │ │
│  │  REST /v1 · WebSocket · API Key auth · OpenAPI docs        │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐ │
│  │              JOB QUEUE (SQLite-backed)                      │ │
│  │  Priorities: high / normal / batch · Retry + backoff       │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐ │
│  │           RESOURCE MANAGER (auto-detect)                    │ │
│  │  Reads RAM + CPU · Computes max pool size · Throttles       │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐ │
│  │              BROWSER POOL MANAGER                           │ │
│  │  1 Chromium process · N isolated BrowserContexts           │ │
│  │  playwright-extra + stealth · Fingerprint rotation         │ │
│  └──────────┬──────────────────────────┬──────────────────────┘ │
│             │                          │                         │
│  ┌──────────▼──────────┐  ┌───────────▼───────────────────────┐ │
│  │   SESSION MANAGER   │  │       PLATFORM ROUTER             │ │
│  │  AES-256 store      │  │  YouTube → zeusdl + DOM           │ │
│  │  Auto-refresh       │  │  TikTok  → zeusdl + stealth       │ │
│  │  Multi-account      │  │  Instagram → session + stealth    │ │
│  │  Validity check     │  │  Reddit  → public API + cookie    │ │
│  └─────────────────────┘  │  Generic → Jina + Playwright      │ │
│                           └───────────┬───────────────────────┘ │
│                                       │                         │
│  ┌────────────────────────────────────▼───────────────────────┐ │
│  │               EXTRACTION PIPELINE                           │ │
│  │  L1: CSS Selectors (fast, deterministic)                   │ │
│  │  L2: window.__data__ / JSON blobs (most reliable)          │ │
│  │  L3: AI Extraction Engine (multi-provider, on failure)     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │             PERSISTENCE (SQLite)                            │ │
│  │  jobs · results · sessions · api_keys · audit_log          │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                │ HTTP + WebSocket
    ┌───────────┴──────────────────────────┐
    │  API Consumers                        │
    │  • React Dashboard (embedded)         │
    │  • Flutter mobile (future)            │
    │  • Third-party scripts / SDKs         │
    │  • AI Agents (MCP-compatible)         │
    └──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Node.js 22 LTS + TypeScript strict | Native Playwright, best stealth ecosystem |
| API Framework | Fastify | 2× faster than Express, built-in schema validation, OpenAPI plugin |
| Browser automation | Playwright + playwright-extra + stealth | Best anti-detection combo |
| Downloader | **zeusdl** (fork of yt-dlp by ferelking242) | Structured extraction for YouTube/TikTok |
| Job queue | Custom SQLite queue (better-sqlite3) | Zero external deps, survives restarts |
| Database | SQLite (better-sqlite3) | Embedded, zero-config, fast |
| Session store | SQLite + AES-256-GCM (node:crypto) | Cookies/credentials never in plaintext |
| Hardware monitor | systeminformation | Cross-OS RAM/CPU detection |
| AI Engine | Vercel AI SDK (unified multi-provider) | One interface for all providers |
| Logging | pino | JSON structured, ultra-fast, Fastify native |
| Dashboard | React 18 + Vite + Tailwind | Fast build, served as static files by backend |

---

## AI Extraction Engine — Providers

| Provider | Package | Key required |
|----------|---------|-------------|
| OpenAI (GPT-4o, o3) | @ai-sdk/openai | Yes |
| Anthropic (Claude) | @ai-sdk/anthropic | Yes |
| Google Gemini | @ai-sdk/google | Yes |
| Groq (fast, free tier) | @ai-sdk/groq | Yes (free) |
| Mistral | @ai-sdk/mistral | Yes |
| DeepSeek | @ai-sdk/deepseek | Yes |
| xAI Grok | @ai-sdk/xai | Yes |
| Ollama (local, free) | ollama-ai-provider | **No** |

Config in `config.yaml` — first provider with a key wins. Disabled gracefully if none configured.

---

## Platform Strategy

| Platform | Primary | Fallback 1 | Fallback 2 |
|----------|---------|-----------|-----------|
| YouTube | zeusdl --dump-json | ytInitialData blob | Playwright stealth |
| TikTok | zeusdl + stealth comments | window.__INITIAL_STATE__ | AI Engine |
| Instagram | Session cookie + stealth | Jina Reader (public) | — |
| Facebook | Session cookie + stealth | Jina Reader (public) | — |
| Reddit | Public JSON API | Cookie + stealth | — |
| Twitter/X | Session + bearer | Nitter fallback | — |
| Generic | Jina Reader | Playwright headless | AI Engine |

---

## API Endpoints

```
POST   /v1/scrape              Scrape a URL → JSON/Markdown/HTML/Screenshot
POST   /v1/crawl               Recursively crawl a domain
POST   /v1/batch               Scrape N URLs async (returns job IDs)
GET    /v1/jobs/:id            Job status + result
DELETE /v1/jobs/:id            Cancel a job
GET    /v1/jobs                List jobs (filter by status/platform)

POST   /v1/sessions            Create session (cookies or credentials)
GET    /v1/sessions            List active sessions
GET    /v1/sessions/:id/check  Validate session freshness
DELETE /v1/sessions/:id        Remove session

GET    /v1/health              System status (CPU%, RAM%, pool size, queue depth)
GET    /v1/platforms           Supported platforms + adapter status

POST   /v1/keys                Generate API key
DELETE /v1/keys/:id            Revoke API key

WS     /v1/jobs/:id/stream     Real-time job progress stream
WS     /v1/stream              Global live stream (dashboard)
```

---

## Resource Auto-Detection

```typescript
const ramGB   = os.totalmem() / 1e9
const cores   = os.cpus().length
const byRam   = Math.floor((ramGB * 0.60) / 0.35)   // 60% usable RAM / ~350MB per context
const byCpu   = Math.floor(cores * 0.75)
const poolMax = Math.min(byRam, byCpu, 12)            // hard cap at 12
// CPU > 85% for 10s → pause new jobs
// RAM > 80% → reduce pool + force GC
```

Manual override via `config.yaml` → `browser.pool_max: 4`

---

## Development Phases

### Phase 1 — Core (Week 1–2)
- [x] TypeScript + Fastify + SQLite setup
- [x] ResourceManager + BrowserPool
- [x] JobQueue (priority, retry, TTL)
- [x] `/health` + `/scrape` (sync)
- [x] API key auth + rate limiting

### Phase 2 — Extraction (Week 3–4)
- [x] Generic adapter (Jina + Playwright)
- [x] 3-level extraction pipeline
- [x] Output formatters (JSON/Markdown/HTML/Screenshot)
- [x] Async jobs + WebSocket streaming

### Phase 3 — Sessions & Platforms (Week 5–6)
- [x] SessionStore (AES-256) + SessionValidator + LoginAgent
- [x] YouTube adapter (zeusdl primary)
- [x] TikTok adapter (zeusdl + stealth)
- [x] Instagram/Reddit adapters

### Phase 4 — Dashboard & Shipping (Week 7–8)
- [x] React dashboard (Jobs, Sessions, Health, Settings)
- [x] Docker + docker-compose
- [x] GitHub Actions build workflow
- [x] OpenAPI docs auto-generated
- [x] `deepfetch doctor` CLI command

### Phase 5 — Mobile Client (Future)
- [ ] Flutter client consuming the API
