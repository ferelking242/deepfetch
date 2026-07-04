/**
 * ActionExecutor — executes the full BrowserAction union type sequentially on a
 * Playwright Page.  Results from named actions (get_text, evaluate, etc.) are
 * accumulated in an `actionResults` map and returned to the caller so they can
 * be embedded in the final ScrapeResult.
 */

import type { Page, BrowserContext } from 'playwright'
import type { Logger } from 'pino'
import type { BrowserAction } from '../types/index.js'
import type { AIEngine } from '../ai/AIEngine.js'
import { humanMouseMove, solveCaptcha } from './CaptchaSolver.js'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── Device presets ────────────────────────────────────────────────────────────

const DEVICE_PRESETS = {
  mobile:  { width: 390, height: 844,  deviceScaleFactor: 3, isMobile: true,  hasTouch: true },
  tablet:  { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true,  hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeActions(
  page: Page,
  context: BrowserContext,
  actions: BrowserAction[],
  aiEngine: AIEngine,
  logger: Logger,
): Promise<Record<string, unknown>> {
  const actionResults: Record<string, unknown> = {}

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    logger.debug({ step: i + 1, type: action.type }, 'Action')

    try {
      await runAction(page, context, action, actionResults, aiEngine, logger)
    } catch (err) {
      logger.warn({ step: i + 1, type: action.type, err }, 'Action failed — continuing')
    }
  }

  return actionResults
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function runAction(
  page: Page,
  context: BrowserContext,
  action: BrowserAction,
  results: Record<string, unknown>,
  aiEngine: AIEngine,
  logger: Logger,
): Promise<void> {
  switch (action.type) {

    // ── Interaction ──────────────────────────────────────────────────────────

    case 'click': {
      await humanMouseMove(page, action.selector)
      await page.click(action.selector, {
        button: action.button ?? 'left',
        clickCount: action.count ?? 1,
        delay: action.delay ?? 50 + Math.random() * 80,
      })
      await page.waitForTimeout(400 + Math.random() * 200)
      break
    }

    case 'fill': {
      await page.fill(action.selector, action.value)
      break
    }

    case 'type': {
      // Character-by-character, human-like
      await page.locator(action.selector).first().focus()
      await page.keyboard.type(action.text, { delay: action.delay ?? 40 + Math.random() * 60 })
      break
    }

    case 'press': {
      const mods = (action.modifiers ?? []).join('+')
      const combo = mods ? `${mods}+${action.key}` : action.key
      await page.keyboard.press(combo)
      break
    }

    case 'select': {
      const val = Array.isArray(action.value) ? action.value : [action.value]
      await page.selectOption(action.selector, val)
      break
    }

    case 'check': {
      await page.check(action.selector)
      break
    }

    case 'uncheck': {
      await page.uncheck(action.selector)
      break
    }

    case 'focus': {
      await page.focus(action.selector)
      break
    }

    case 'clear': {
      await page.fill(action.selector, '')
      break
    }

    case 'hover': {
      await humanMouseMove(page, action.selector)
      await page.hover(action.selector)
      break
    }

    case 'drag': {
      const src = page.locator(action.source).first()
      const dst = page.locator(action.target).first()
      await src.dragTo(dst)
      break
    }

    case 'upload_file': {
      // Accept base64 data URIs only (no remote fetch — prevents SSRF)
      const paths: string[] = []
      for (const f of action.files) {
        if (f.startsWith('data:')) {
          const [meta, b64] = f.split(',')
          const ext = (meta.match(/\/([a-z0-9]+);/) ?? [])[1] ?? 'bin'
          const dest = join(tmpdir(), `upload-${randomUUID()}.${ext}`)
          await writeFile(dest, Buffer.from(b64, 'base64'))
          paths.push(dest)
        } else if (f.startsWith('/') || f.startsWith('./')) {
          // Absolute/relative local path (e.g. previously downloaded file)
          paths.push(f)
        } else {
          throw new Error(
            `upload_file: only base64 data URIs (data:...) or local paths are accepted. ` +
            `Remote URLs are not supported to prevent server-side request forgery.`
          )
        }
      }
      const input = page.locator(action.selector).first()
      await input.setInputFiles(paths)
      break
    }

    // ── Navigation ───────────────────────────────────────────────────────────

    case 'goto': {
      await page.goto(action.url, {
        waitUntil: action.wait_until ?? 'domcontentloaded',
        timeout: 30_000,
      })
      break
    }

    case 'go_back': {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null)
      break
    }

    case 'go_forward': {
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null)
      break
    }

    case 'reload': {
      await page.reload({ waitUntil: action.wait_until ?? 'domcontentloaded', timeout: 30_000 })
      break
    }

    // ── Wait ─────────────────────────────────────────────────────────────────

    case 'wait': {
      await page.waitForTimeout(Math.min(action.ms, 60_000))
      break
    }

    case 'wait_for_selector': {
      await page.waitForSelector(action.selector, {
        state: action.state ?? 'visible',
        timeout: action.timeout ?? 15_000,
      }).catch(() => null)
      break
    }

    case 'wait_for_url': {
      await page.waitForURL(action.pattern, { timeout: action.timeout ?? 15_000 }).catch(() => null)
      break
    }

    case 'wait_for_load_state': {
      await page.waitForLoadState(action.state ?? 'domcontentloaded', {
        timeout: action.timeout ?? 30_000,
      }).catch(() => null)
      break
    }

    case 'wait_for_function': {
      await page.waitForFunction(action.expression, {
        timeout: action.timeout ?? 15_000,
      }).catch(() => null)
      break
    }

    case 'wait_for_response': {
      const resp = await page.waitForResponse(
        r => r.url().includes(action.url_pattern),
        { timeout: action.timeout ?? 30_000 }
      ).catch(() => null)
      if (action.as && resp) {
        try { results[action.as] = await resp.json() } catch { results[action.as] = await resp.text().catch(() => null) }
      }
      break
    }

    // ── Scroll ───────────────────────────────────────────────────────────────

    case 'scroll': {
      if (action.selector) {
        await page.locator(action.selector).first().scrollIntoViewIfNeeded().catch(() => null)
      } else {
        await page.mouse.wheel(action.x ?? 0, action.y ?? 300)
      }
      break
    }

    case 'scroll_to_bottom': {
      const maxH = action.max_height ?? 30_000
      const step = action.step ?? 300
      const delay = action.delay_ms ?? 100
      await page.evaluate(
        async ({ maxH, step, delay }: { maxH: number; step: number; delay: number }) => {
          await new Promise<void>(resolve => {
            let total = 0
            const timer = setInterval(() => {
              window.scrollBy(0, step)
              total += step
              if (total >= document.body.scrollHeight - window.innerHeight || total >= maxH) {
                clearInterval(timer)
                resolve()
              }
            }, delay)
          })
        },
        { maxH, step, delay }
      )
      break
    }

    // ── Viewport / Environment ───────────────────────────────────────────────

    case 'set_viewport': {
      await page.setViewportSize({ width: action.width, height: action.height })
      break
    }

    case 'set_geolocation': {
      await context.setGeolocation({
        latitude: action.latitude,
        longitude: action.longitude,
        accuracy: action.accuracy ?? 10,
      })
      await context.grantPermissions(['geolocation'])
      break
    }

    case 'emulate_device': {
      const preset = DEVICE_PRESETS[action.device]
      await page.setViewportSize({ width: preset.width, height: preset.height })
      await page.evaluate(({ scale }: { scale: number }) => {
        Object.defineProperty(window, 'devicePixelRatio', { get: () => scale })
      }, { scale: preset.deviceScaleFactor })
      break
    }

    // ── JavaScript ───────────────────────────────────────────────────────────

    case 'evaluate': {
      const val = await page.evaluate(action.expression).catch(err => `ERROR: ${err.message}`)
      if (action.as) results[action.as] = val
      break
    }

    case 'set_local_storage': {
      await page.evaluate(
        ({ key, value }: { key: string; value: string }) => localStorage.setItem(key, value),
        { key: action.key, value: action.value }
      )
      break
    }

    case 'set_cookie': {
      await context.addCookies([{
        name: action.name,
        value: action.value,
        domain: action.domain ?? new URL(page.url()).hostname,
        path: action.path ?? '/',
        secure: action.secure ?? false,
        httpOnly: false,
        sameSite: 'Lax',
      }])
      break
    }

    case 'clear_cookies': {
      await context.clearCookies()
      break
    }

    // ── Mid-action Capture ───────────────────────────────────────────────────

    case 'screenshot': {
      // Resolve format
      const fmt = (action.format ?? 'png') as 'png' | 'jpeg' | 'webp'
      const quality = fmt !== 'png' ? (action.quality ?? 85) : undefined

      // Resolve resolution: explicit w/h > preset > current viewport
      const RES: Record<string, { width: number; height: number }> = {
        '360p':  { width: 640,  height: 360  },
        '480p':  { width: 854,  height: 480  },
        '720p':  { width: 1280, height: 720  },
        '1080p': { width: 1920, height: 1080 },
        '2k':    { width: 2560, height: 1440 },
        '4k':    { width: 3840, height: 2160 },
      }
      const targetSize = action.width && action.height
        ? { width: action.width, height: action.height }
        : action.resolution
          ? RES[action.resolution]
          : null

      // Temporarily resize viewport if a custom size was requested
      const originalVp = page.viewportSize()
      if (targetSize) await page.setViewportSize(targetSize)

      const dest = join(tmpdir(), `action-screenshot-${randomUUID()}.${fmt}`)
      if (action.selector) {
        const el = page.locator(action.selector).first()
        await el.screenshot({ path: dest, type: fmt, quality }).catch(() => null)
      } else {
        await page.screenshot({
          path: dest,
          type: fmt,
          quality,
          fullPage: action.full_page ?? false,
        })
      }

      // Restore viewport
      if (targetSize && originalVp) await page.setViewportSize(originalVp)

      const key = action.as ?? `screenshot_${Date.now()}`
      results[key] = dest
      logger.debug({ key, dest, fmt, size: targetSize }, 'Screenshot captured')
      break
    }

    case 'get_text': {
      const text = await page.locator(action.selector).first().innerText().catch(() => null)
      results[action.as ?? action.selector] = text
      break
    }

    case 'get_attribute': {
      const val = await page.locator(action.selector).first().getAttribute(action.attribute).catch(() => null)
      results[action.as ?? `${action.selector}@${action.attribute}`] = val
      break
    }

    case 'get_value': {
      const val = await page.locator(action.selector).first().inputValue().catch(() => null)
      results[action.as ?? action.selector] = val
      break
    }

    // ── Network ──────────────────────────────────────────────────────────────

    case 'block_resources': {
      const blocked = new Set(action.resource_types)
      await page.route('**/*', async (route) => {
        if (blocked.has(route.request().resourceType() as typeof action.resource_types[number])) {
          await route.abort()
        } else {
          await route.continue()
        }
      })
      break
    }

    case 'set_headers': {
      await page.setExtraHTTPHeaders(action.headers)
      break
    }

    // ── Anti-bot / CAPTCHA ───────────────────────────────────────────────────

    case 'solve_captcha': {
      const captchaResult = await solveCaptcha(page, action.variant ?? 'auto', aiEngine, logger)
      results['captcha_result'] = captchaResult
      if (!captchaResult.solved) {
        logger.warn({ captchaResult }, 'CAPTCHA not solved — continuing anyway')
      }
      break
    }

    case 'humanize_mouse': {
      const jitter = action.jitter ?? 3
      // Move multiple times with micro-jitter
      for (let i = 0; i < 3; i++) {
        await humanMouseMove(page, action.selector)
        await page.waitForTimeout(50 + Math.random() * 100)
        await page.mouse.move(
          (await page.locator(action.selector).first().boundingBox().catch(() => ({ x: 0, y: 0, width: 0, height: 0 })))!.x + Math.random() * jitter,
          (await page.locator(action.selector).first().boundingBox().catch(() => ({ x: 0, y: 0, width: 0, height: 0 })))!.y + Math.random() * jitter,
        )
      }
      break
    }

    default: {
      logger.warn({ type: (action as BrowserAction).type }, 'Unknown action type — skipped')
    }
  }
}
