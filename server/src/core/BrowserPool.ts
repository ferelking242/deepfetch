import { chromium, type Browser, type BrowserContext } from 'playwright'
// @ts-expect-error no types for playwright-extra
import { chromium as chromiumExtra } from 'playwright-extra'
// @ts-expect-error no types for stealth plugin
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Logger } from 'pino'
import { getConfig } from '../config/loader.js'
import type { CookieEntry } from '../types/index.js'

chromiumExtra.use(StealthPlugin())

interface PoolSlot {
  context: BrowserContext
  inUse: boolean
  createdAt: number
  useCount: number
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
]

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
]

const LOCALES = ['en-US', 'en-GB', 'fr-FR', 'de-DE']
const TIMEZONES = ['America/New_York', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles']

export class BrowserPool {
  private browser: Browser | null = null
  private slots: PoolSlot[] = []
  private readonly logger: Logger
  private readonly maxSlots: number

  constructor(maxSlots: number, logger: Logger) {
    this.maxSlots = maxSlots
    this.logger = logger
  }

  async init(): Promise<void> {
    const cfg = getConfig()
    this.logger.info({ headless: cfg.browser.headless }, 'Launching Chromium (stealth mode)')

    this.browser = await chromiumExtra.launch({
      headless: cfg.browser.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    }) as Browser

    this.logger.info('BrowserPool ready')
  }

  async acquire(cookies?: CookieEntry[]): Promise<BrowserContext> {
    if (!this.browser) throw new Error('BrowserPool not initialized')

    // Reuse a free slot
    const free = this.slots.find(s => !s.inUse)
    if (free) {
      free.inUse = true
      free.useCount++

      if (cookies?.length) {
        await free.context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0])
      }
      return free.context
    }

    // Create new slot if under limit
    if (this.slots.length < this.maxSlots) {
      const context = await this.createContext(cookies)
      const slot: PoolSlot = { context, inUse: true, createdAt: Date.now(), useCount: 1 }
      this.slots.push(slot)
      return context
    }

    // Wait for a slot to free up
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('BrowserPool: timeout waiting for free slot')), 60_000)
      const interval = setInterval(async () => {
        const s = this.slots.find(s => !s.inUse)
        if (s) {
          clearInterval(interval)
          clearTimeout(timeout)
          s.inUse = true
          s.useCount++
          if (cookies?.length) {
            await s.context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0])
          }
          resolve(s.context)
        }
      }, 200)
    })
  }

  async release(context: BrowserContext): Promise<void> {
    const cfg = getConfig()
    const slot = this.slots.find(s => s.context === context)
    if (!slot) return

    const age = (Date.now() - slot.createdAt) / 1000
    const shouldRecycle = age > cfg.browser.context_ttl_seconds || slot.useCount > 50

    if (shouldRecycle) {
      this.slots = this.slots.filter(s => s !== slot)
      await slot.context.close().catch(() => null)
      this.logger.debug('Recycled browser context')
    } else {
      // Clear cookies and storage for next use
      await slot.context.clearCookies().catch(() => null)
      slot.inUse = false
    }
  }

  private async createContext(cookies?: CookieEntry[]): Promise<BrowserContext> {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    const vp = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
    const locale = LOCALES[Math.floor(Math.random() * LOCALES.length)]
    const tz = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)]

    const context = await this.browser!.newContext({
      userAgent: ua,
      viewport: vp,
      locale,
      timezoneId: tz,
      extraHTTPHeaders: {
        'Accept-Language': locale.replace('_', '-') + ',en;q=0.9',
      },
    })

    if (cookies?.length) {
      await context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0])
    }

    return context
  }

  getStats(): { active: number; total: number; max: number } {
    return {
      active: this.slots.filter(s => s.inUse).length,
      total: this.slots.length,
      max: this.maxSlots,
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.slots.map(s => s.context.close().catch(() => null)))
    this.slots = []
    await this.browser?.close().catch(() => null)
    this.browser = null
    this.logger.info('BrowserPool shut down')
  }
}
