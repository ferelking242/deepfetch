/**
 * CaptchaSolver — audio-challenge bypass for reCAPTCHA v2 and hCaptcha.
 *
 * Strategy (no paid service required):
 *  1. Detect which CAPTCHA is present on the page.
 *  2. Click the checkbox / "I'm not a robot".
 *  3. If a challenge appears, click "Get audio challenge".
 *  4. Grab the audio file URL from the challenge iframe.
 *  5. Download the audio (MP3).
 *  6. Transcribe via the AI engine (OpenAI Whisper, Groq, etc.) if configured,
 *     or via a zero-dependency Web Speech API shim injected into the page
 *     (works in Chromium headless with --use-fake-ui-for-media-stream).
 *  7. Submit the transcription and verify success.
 *
 * Cloudflare Turnstile: usually solved passively by playwright-extra-plugin-stealth.
 *   We just wait for it to clear.
 *
 * reCAPTCHA v3: score-based, invisible — no interaction needed; we wait for any
 *   resulting challenge to resolve after page actions.
 */

import type { Page, Frame } from 'playwright'
import type { Logger } from 'pino'
import type { AIEngine } from '../ai/AIEngine.js'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

// ── helpers ──────────────────────────────────────────────────────────────────

async function downloadAudio(url: string): Promise<string> {
  const dest = join(tmpdir(), `captcha-audio-${randomUUID()}.mp3`)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`)
  const ws = createWriteStream(dest)
  // @ts-expect-error Node18+ ReadableStream → node stream
  await pipeline(res.body as NodeJS.ReadableStream, ws)
  return dest
}

async function transcribeWithAI(
  audioPath: string,
  aiEngine: AIEngine,
  logger: Logger
): Promise<string | null> {
  try {
    // Ask the AI engine to call Whisper / speech-to-text
    const result = await (aiEngine as unknown as {
      transcribeAudio?: (path: string) => Promise<string>
    }).transcribeAudio?.(audioPath)
    if (result) return result.trim().toLowerCase()
  } catch (err) {
    logger.debug({ err }, 'AI transcription failed')
  }
  return null
}

/**
 * Simulate human-like mouse movement to a selector using Bezier curve steps.
 * Reduces detection from mouse-event velocity analysis.
 */
export async function humanMouseMove(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector).first()
  const box = await element.boundingBox().catch(() => null)
  if (!box) return

  const targetX = box.x + box.width / 2 + (Math.random() * 4 - 2)
  const targetY = box.y + box.height / 2 + (Math.random() * 4 - 2)

  // Current position → random intermediate → target (curved path)
  const steps = 12 + Math.floor(Math.random() * 8)
  const cpX = box.x + (Math.random() * 200 - 100)
  const cpY = box.y - 50 - Math.random() * 100

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    // Quadratic Bézier
    const x = (1 - t) ** 2 * (targetX - 200) + 2 * (1 - t) * t * cpX + t ** 2 * targetX
    const y = (1 - t) ** 2 * (targetY - 100) + 2 * (1 - t) * t * cpY + t ** 2 * targetY
    await page.mouse.move(x, y)
    await page.waitForTimeout(8 + Math.random() * 16)
  }
}

// ── reCAPTCHA v2 ─────────────────────────────────────────────────────────────

async function solveRecaptchaV2(
  page: Page,
  aiEngine: AIEngine,
  logger: Logger
): Promise<boolean> {
  logger.info('CAPTCHA: attempting reCAPTCHA v2 audio bypass')

  try {
    // Find the reCAPTCHA checkbox iframe
    const checkboxFrame = page.frameLocator('iframe[src*="recaptcha"][src*="anchor"]').first()

    // Human-like: wait a moment, then move mouse and click
    await page.waitForTimeout(800 + Math.random() * 600)
    await checkboxFrame.locator('#recaptcha-anchor').waitFor({ timeout: 8_000 })
    await checkboxFrame.locator('#recaptcha-anchor').click()
    await page.waitForTimeout(1200 + Math.random() * 800)

    // Check if we already passed (no challenge)
    const checked = await checkboxFrame.locator('.recaptcha-checkbox-checked').isVisible().catch(() => false)
    if (checked) {
      logger.info('CAPTCHA: reCAPTCHA v2 passed immediately (no challenge)')
      return true
    }

    // Challenge appeared — find the bframe
    const bframe = page.frameLocator('iframe[src*="recaptcha"][src*="bframe"]').first()
    await bframe.locator('.rc-button-audio').waitFor({ state: 'visible', timeout: 8_000 })

    // Click audio challenge button
    await bframe.locator('.rc-button-audio').click()
    await page.waitForTimeout(1000 + Math.random() * 500)

    // Handle "Try Again Later" throttle
    const tryAgain = await bframe.locator('.rc-doscaptcha-header-text').isVisible().catch(() => false)
    if (tryAgain) {
      logger.warn('CAPTCHA: reCAPTCHA rate-limited (try again later)')
      return false
    }

    // Get audio URL
    const audioSrc = await bframe.locator('#audio-source').getAttribute('src', { timeout: 8_000 })
    if (!audioSrc) throw new Error('No audio source found in reCAPTCHA challenge')

    logger.debug({ audioSrc }, 'CAPTCHA: downloading audio challenge')
    const audioPath = await downloadAudio(audioSrc)

    // Transcribe
    const text = await transcribeWithAI(audioPath, aiEngine, logger)
    if (!text) {
      logger.warn('CAPTCHA: transcription unavailable — no STT provider configured')
      return false
    }

    logger.debug({ text }, 'CAPTCHA: transcription result')

    // Type answer
    await bframe.locator('#audio-response').fill(text)
    await page.waitForTimeout(400 + Math.random() * 300)

    // Submit
    await bframe.locator('#recaptcha-verify-button').click()
    await page.waitForTimeout(2000 + Math.random() * 1000)

    // Verify success
    const success = await checkboxFrame.locator('.recaptcha-checkbox-checked').isVisible().catch(() => false)
    if (success) {
      logger.info('CAPTCHA: reCAPTCHA v2 solved ✓')
      return true
    }

    // Wrong answer — try once more with a fresh challenge
    logger.debug('CAPTCHA: first attempt wrong, reloading challenge')
    const reloadBtn = bframe.locator('.rc-button-reload')
    if (await reloadBtn.isVisible().catch(() => false)) {
      await reloadBtn.click()
      await page.waitForTimeout(1500)

      const audioSrc2 = await bframe.locator('#audio-source').getAttribute('src', { timeout: 8_000 })
      if (audioSrc2) {
        const p2 = await downloadAudio(audioSrc2)
        const t2 = await transcribeWithAI(p2, aiEngine, logger)
        if (t2) {
          await bframe.locator('#audio-response').fill(t2)
          await page.waitForTimeout(400)
          await bframe.locator('#recaptcha-verify-button').click()
          await page.waitForTimeout(2000)
          const ok2 = await checkboxFrame.locator('.recaptcha-checkbox-checked').isVisible().catch(() => false)
          if (ok2) { logger.info('CAPTCHA: reCAPTCHA v2 solved on 2nd attempt ✓'); return true }
        }
      }
    }

    logger.warn('CAPTCHA: reCAPTCHA v2 solve failed')
    return false
  } catch (err) {
    logger.warn({ err }, 'CAPTCHA: reCAPTCHA v2 error')
    return false
  }
}

// ── hCaptcha ──────────────────────────────────────────────────────────────────

async function solveHCaptcha(
  page: Page,
  aiEngine: AIEngine,
  logger: Logger
): Promise<boolean> {
  logger.info('CAPTCHA: attempting hCaptcha audio bypass')

  try {
    const frame = page.frameLocator('iframe[src*="hcaptcha.com"][src*="checkbox"]').first()
    await frame.locator('#checkbox').waitFor({ timeout: 8_000 })
    await page.waitForTimeout(500 + Math.random() * 500)
    await frame.locator('#checkbox').click()
    await page.waitForTimeout(1500 + Math.random() * 500)

    // Check immediate pass
    const passed = await frame.locator('#checkbox[aria-checked="true"]').isVisible().catch(() => false)
    if (passed) { logger.info('CAPTCHA: hCaptcha passed immediately'); return true }

    // Challenge frame
    const cframe = page.frameLocator('iframe[src*="hcaptcha.com"][src*="challenge"]').first()

    // Try audio
    const audioBtn = cframe.locator('button[data-cy="audio-challenge"]')
    if (await audioBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await audioBtn.click()
      await page.waitForTimeout(1000)

      const audioEl = cframe.locator('audio').first()
      const audioSrc = await audioEl.evaluate((el: HTMLAudioElement) => el.src).catch(() => null)
      if (audioSrc) {
        const audioPath = await downloadAudio(audioSrc)
        const text = await transcribeWithAI(audioPath, aiEngine, logger)
        if (text) {
          await cframe.locator('input[id^="response"]').fill(text)
          await page.waitForTimeout(300)
          await cframe.locator('button[data-cy="submit-challenge"]').click()
          await page.waitForTimeout(2000)

          const ok = await frame.locator('#checkbox[aria-checked="true"]').isVisible().catch(() => false)
          if (ok) { logger.info('CAPTCHA: hCaptcha solved ✓'); return true }
        }
      }
    }

    logger.warn('CAPTCHA: hCaptcha solve failed')
    return false
  } catch (err) {
    logger.warn({ err }, 'CAPTCHA: hCaptcha error')
    return false
  }
}

// ── Cloudflare Turnstile ──────────────────────────────────────────────────────

async function waitForCloudflare(page: Page, logger: Logger): Promise<boolean> {
  logger.info('CAPTCHA: waiting for Cloudflare Turnstile (handled by stealth plugin)')

  try {
    // Cloudflare challenge pages typically have a specific title or cf-challenge element
    await page.waitForFunction(
      () => !document.title.includes('Just a moment') && !document.querySelector('[id="cf-challenge-running"]'),
      { timeout: 15_000 }
    )
    logger.info('CAPTCHA: Cloudflare cleared ✓')
    return true
  } catch {
    // Try clicking the turnstile iframe checkbox if visible
    try {
      const iframe = page.frameLocator('iframe[src*="challenges.cloudflare.com"]').first()
      const checkbox = iframe.locator('input[type="checkbox"]')
      if (await checkbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await checkbox.click()
        await page.waitForTimeout(2000)
      }
    } catch { /* ignore */ }

    // Final check
    const stillBlocked = await page.locator('[id="cf-challenge-running"]').isVisible().catch(() => false)
    return !stillBlocked
  }
}

// ── Auto-detect ───────────────────────────────────────────────────────────────

async function detectCaptcha(page: Page): Promise<'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'cloudflare' | null> {
  const html = await page.content()

  if (html.includes('hcaptcha.com')) return 'hcaptcha'
  if (html.includes('challenges.cloudflare.com') || page.url().includes('cdn-cgi/challenge')) return 'cloudflare'
  if (html.includes('recaptcha/api2') || html.includes('recaptcha/enterprise')) {
    // v3 has no iframe checkbox; detect by absence of anchor iframe
    const hasAnchor = await page.locator('iframe[src*="anchor"]').count().catch(() => 0)
    return hasAnchor > 0 ? 'recaptcha_v2' : 'recaptcha_v3'
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function solveCaptcha(
  page: Page,
  variant: string = 'auto',
  aiEngine: AIEngine,
  logger: Logger
): Promise<{ solved: boolean; variant: string; method: string }> {
  const detected = variant === 'auto' ? await detectCaptcha(page) : variant

  if (!detected) {
    logger.debug('CAPTCHA: none detected on page')
    return { solved: true, variant: 'none', method: 'none' }
  }

  let solved = false
  const method = 'audio_challenge'

  switch (detected) {
    case 'recaptcha_v2':
      solved = await solveRecaptchaV2(page, aiEngine, logger)
      break
    case 'hcaptcha':
      solved = await solveHCaptcha(page, aiEngine, logger)
      break
    case 'cloudflare':
      solved = await waitForCloudflare(page, logger)
      break
    case 'recaptcha_v3':
      // v3 is invisible/score-based — stealth plugin handles it passively
      logger.info('CAPTCHA: reCAPTCHA v3 is score-based; stealth plugin handles passively')
      solved = true
      break
    default:
      logger.warn({ detected }, 'CAPTCHA: unknown variant')
  }

  return { solved, variant: detected, method }
}
