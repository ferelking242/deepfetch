#!/usr/bin/env node
/**
 * deepfetch doctor — health check for all platform adapters and dependencies
 */
import { execa } from 'execa'
import { loadConfig } from '../config/loader.js'

const cfg = loadConfig()

type Status = 'ok' | 'warn' | 'fail'

interface Check {
  name: string
  status: Status
  message: string
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = []

  // 1. zeusdl binary
  try {
    const { stdout } = await execa(cfg.zeusdl.binary, ['--version'], { timeout: 5_000 })
    checks.push({ name: 'zeusdl binary', status: 'ok', message: stdout.trim() })
  } catch {
    checks.push({ name: 'zeusdl binary', status: 'fail', message: `"${cfg.zeusdl.binary}" not found in PATH. Install from github.com/ferelking242/zeusdl` })
  }

  // 2. Playwright Chromium
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const version = browser.version()
    await browser.close()
    checks.push({ name: 'Playwright Chromium', status: 'ok', message: `version ${version}` })
  } catch (err) {
    checks.push({ name: 'Playwright Chromium', status: 'fail', message: `Failed to launch: ${err}. Run: npx playwright install chromium` })
  }

  // 3. AI Engine providers
  const aiCfg = cfg.ai_engine
  if (!aiCfg.enabled) {
    checks.push({ name: 'AI Engine', status: 'warn', message: 'Disabled in config (ai_engine.enabled: false)' })
  } else {
    let foundProvider = false
    for (const p of aiCfg.providers) {
      if (p.local) {
        try {
          const res = await fetch((p.base_url ?? 'http://localhost:11434') + '/api/tags', { signal: AbortSignal.timeout(3000) })
          if (res.ok) {
            checks.push({ name: `AI Engine [${p.name}]`, status: 'ok', message: `Ollama running at ${p.base_url}` })
            foundProvider = true
          }
        } catch {
          checks.push({ name: `AI Engine [${p.name}]`, status: 'warn', message: 'Ollama not running (optional — start with: ollama serve)' })
        }
      } else if (p.api_key?.trim()) {
        checks.push({ name: `AI Engine [${p.name}]`, status: 'ok', message: `API key configured (model: ${p.model})` })
        foundProvider = true
      } else {
        checks.push({ name: `AI Engine [${p.name}]`, status: 'warn', message: 'No API key configured — provider disabled' })
      }
    }
    if (!foundProvider) {
      checks.push({ name: 'AI Engine', status: 'warn', message: 'No active provider. AI extraction disabled. Configure a key in config.yaml.' })
    }
  }

  // 4. Session encryption key
  if (!cfg.sessions.encryption_key || cfg.sessions.encryption_key.length < 64) {
    checks.push({ name: 'Session encryption key', status: 'fail', message: 'sessions.encryption_key is missing or too short. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"' })
  } else {
    checks.push({ name: 'Session encryption key', status: 'ok', message: '32-byte key configured' })
  }

  // 5. Jina Reader (generic fallback)
  try {
    const res = await fetch('https://r.jina.ai/https://example.com', { signal: AbortSignal.timeout(8000) })
    checks.push({ name: 'Jina Reader (generic)', status: res.ok ? 'ok' : 'warn', message: res.ok ? 'Reachable' : `HTTP ${res.status}` })
  } catch {
    checks.push({ name: 'Jina Reader (generic)', status: 'warn', message: 'Not reachable — generic adapter will rely on Playwright only' })
  }

  return checks
}

function icon(status: Status): string {
  return { ok: '✅', warn: '⚠️ ', fail: '❌' }[status]
}

async function main() {
  console.log('\n🔬 DeepFetch Doctor\n' + '─'.repeat(50))

  const checks = await runChecks()

  for (const c of checks) {
    console.log(`${icon(c.status)} ${c.name.padEnd(30)} ${c.message}`)
  }

  const failed = checks.filter(c => c.status === 'fail').length
  const warned = checks.filter(c => c.status === 'warn').length

  console.log('\n' + '─'.repeat(50))
  console.log(`Results: ${checks.length - failed - warned} ok  ${warned} warn  ${failed} fail`)

  if (failed > 0) {
    console.log('\n❌ Fix failing checks before starting DeepFetch.')
    process.exit(1)
  } else if (warned > 0) {
    console.log('\n⚠️  Warnings detected. DeepFetch will work but some features are limited.')
  } else {
    console.log('\n✅ All systems go. Run: npm start')
  }
}

main().catch(console.error)
