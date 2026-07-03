# DeepFetch

> Universal web scraping & automation engine — self-hosted, API-first, stealth-ready.

[![Build](https://github.com/ferelking242/deepfetch/actions/workflows/build.yml/badge.svg)](https://github.com/ferelking242/deepfetch/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/ferelking242/deepfetch/blob/main/colab/deepfetch.ipynb)

---

## What is DeepFetch?

DeepFetch is a self-hosted server that exposes a clean REST + WebSocket API for scraping and automating any website. It handles:

- **Stealth browsing** — Playwright with anti-detection plugins, fingerprint rotation
- **Multi-platform extraction** — YouTube, TikTok, Instagram, Reddit, and any generic site
- **Authenticated sessions** — AES-256 encrypted cookie store, auto-refresh, automated login
- **AI Extraction Engine** — multi-provider fallback when selectors fail (OpenAI, Gemini, Groq, Anthropic, Mistral, DeepSeek, Ollama…)
- **Job queue** — SQLite-backed priority queue, retry with backoff, WebSocket live streaming
- **Hardware-aware** — auto-detects RAM/CPU, never exceeds your machine's limits
- **React dashboard** — control panel served at `/dashboard`

---

  ## ☁️ Run on Google Colab (Zero Install)

  > **One click** — runs DeepFetch in the cloud, exposes a public HTTPS URL, and gives you a Python agent SDK. No local setup required.

  [![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/ferelking242/deepfetch/blob/main/colab/deepfetch.ipynb)

  The notebook:
  1. Installs Node.js 22 + Playwright Chromium automatically (~5 min first run)
  2. Generates a secure config (master secret + AES-256 session key)
  3. Starts the DeepFetch server and **creates a public `trycloudflare.com` URL** via cloudflared
  4. Creates your first API key
  5. Provides a **`DeepFetchClient`** Python class — drop-in agent SDK

  ```python
  df = DeepFetchClient(PUBLIC_URL, API_KEY)

  # Any URL — returns structured data + markdown
  result = df.scrape("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  print(result.text())           # best text for LLM context

  # Platform-aware: YouTube / TikTok / Reddit / Instagram / generic
  result = df.scrape_json("https://www.reddit.com/r/MachineLearning/top.json")

  # Batch scrape
  results = df.batch(["https://a.com", "https://b.com", "https://c.com"])

  # Recursive crawl
  pages = df.crawl("https://docs.example.com", max_pages=20)

  # System status
  print(df.health())
  ```

  ---
  
## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/ferelking242/deepfetch.git
cd deepfetch
cp server/config.example.yaml config.yaml
# Edit config.yaml — set master_secret + sessions.encryption_key
```

### 2. Install dependencies

```bash
cd server && npm install
npx playwright install chromium
cd ../dashboard && npm install
```

### 3. Run health check

```bash
cd server && npm run doctor
```

### 4. Build & start

```bash
# Terminal 1 — build dashboard
cd dashboard && npm run build

# Terminal 2 — start server
cd server && npm run dev
```

Open: `http://localhost:3000/dashboard`  
API docs: `http://localhost:3000/docs`

---

## Docker

```bash
cp server/config.example.yaml config.yaml
# Edit config.yaml

docker compose up -d
```

---

## API — Quick Reference

```bash
# Scrape a URL (async)
curl -X POST http://localhost:3000/v1/scrape \
  -H "Authorization: Bearer df_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "output": ["json"]}'

# Scrape synchronously (wait for result)
curl -X POST http://localhost:3000/v1/scrape \
  -d '{"url": "...", "sync": true}'

# Check job status
curl http://localhost:3000/v1/jobs/<job_id>

# System health
curl http://localhost:3000/v1/health

# Create session via login
curl -X POST http://localhost:3000/v1/sessions \
  -d '{"type": "credentials", "platform": "instagram", "username": "...", "password": "..."}'
```

---

## AI Extraction Engine

Configure in `config.yaml` under `ai_engine.providers`. First provider with a valid key wins.

| Provider | Free tier | Key env var |
|----------|-----------|-------------|
| Ollama (local) | ✅ Free, no key | — |
| Groq | ✅ Free tier | `GROQ_API_KEY` |
| Google Gemini | ✅ Free tier | `GOOGLE_GENERATIVE_AI_API_KEY` |
| OpenAI | Pay-per-use | `OPENAI_API_KEY` |
| Anthropic | Pay-per-use | `ANTHROPIC_API_KEY` |
| DeepSeek | Pay-per-use | `DEEPSEEK_API_KEY` |
| xAI Grok | Pay-per-use | `XAI_API_KEY` |
| Mistral | Pay-per-use | `MISTRAL_API_KEY` |

---

## Architecture

```
API Gateway (Fastify)
  └─ Job Queue (SQLite)
       └─ Resource Manager (auto-detect CPU/RAM)
            └─ Browser Pool (Playwright + stealth)
                 └─ Platform Router
                      ├─ YouTube → zeusdl + DOM
                      ├─ TikTok  → zeusdl + stealth
                      ├─ Instagram → session + stealth
                      ├─ Reddit  → public API
                      └─ Generic → Jina Reader + Playwright
                           └─ AI Engine (multi-provider fallback)
```

---

## License

MIT — see [LICENSE](LICENSE)
