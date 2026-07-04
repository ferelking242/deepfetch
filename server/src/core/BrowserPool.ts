import { type Browser, type BrowserContext } from 'playwright'
import { chromium as chromiumExtra } from 'playwright-extra'
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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
]

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
]

const LOCALES    = ['en-US', 'en-GB', 'fr-FR', 'de-DE']
const TIMEZONES  = ['America/New_York', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles']

// WebGL vendor/renderer spoofing for fingerprint resistance
const WEBGL_VENDORS = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
]

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

    this.browser = await (chromiumExtra as unknown as typeof import('playwright').chromium).launch({
      headless: cfg.browser.headless,
      args: [
        // Sandbox
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',

        // Anti-detection
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',

        // Performance / stability in headless
        '--disable-gpu',
        '--disable-gl-drawing-for-tests',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',

        // Media / permissions (needed for audio challenge transcription)
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--allow-running-insecure-content',

        // Language
        '--lang=en-US',
        '--accept-lang=en-US,en;q=0.9',

        // Downloads
        '--disable-download-restrictions',
      ],
    }) as Browser

    this.logger.info('BrowserPool ready')
  }

  async acquire(cookies?: CookieEntry[]): Promise<BrowserContext> {
    if (!this.browser) throw new Error('BrowserPool not initialized')

    const free = this.slots.find(s => !s.inUse)
    if (free) {
      free.inUse = true
      free.useCount++
      if (cookies?.length) {
        await free.context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0])
      }
      return free.context
    }

    if (this.slots.length < this.maxSlots) {
      const context = await this.createContext(cookies)
      const slot: PoolSlot = { context, inUse: true, createdAt: Date.now(), useCount: 1 }
      this.slots.push(slot)
      return context
    }

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
      await slot.context.clearCookies().catch(() => null)
      await slot.context.clearPermissions().catch(() => null)
      await slot.context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => null)
      slot.inUse = false
    }
  }

  private async createContext(cookies?: CookieEntry[]): Promise<BrowserContext> {
    const ua    = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    const vp    = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
    const locale = LOCALES[Math.floor(Math.random() * LOCALES.length)]
    const tz    = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)]
    const webgl = WEBGL_VENDORS[Math.floor(Math.random() * WEBGL_VENDORS.length)]

    const context = await this.browser!.newContext({
      userAgent: ua,
      viewport: vp,
      locale,
      timezoneId: tz,
      acceptDownloads: true,
      permissions: ['geolocation', 'microphone'],
      extraHTTPHeaders: {
        'Accept-Language': `${locale.replace('_', '-')},en;q=0.9`,
        'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    })

    // Inject WebGL fingerprint spoofing
    await context.addInitScript(
      ({ vendor, renderer }: { vendor: string; renderer: string }) => {
        const getParam = WebGLRenderingContext.prototype.getParameter
        WebGLRenderingContext.prototype.getParameter = function (param) {
          if (param === 37445) return vendor    // UNMASKED_VENDOR_WEBGL
          if (param === 37446) return renderer  // UNMASKED_RENDERER_WEBGL
          return getParam.call(this, param)
        }
        if (typeof WebGL2RenderingContext !== 'undefined') {
          const getParam2 = WebGL2RenderingContext.prototype.getParameter
          WebGL2RenderingContext.prototype.getParameter = function (param) {
            if (param === 37445) return vendor
            if (param === 37446) return renderer
            return getParam2.call(this, param)
          }
        }
      },
      webgl
    )

    // Spoof navigator.plugins and navigator.languages
    await context.addInitScript(() => {
      // Make navigator.webdriver undetectable
      Object.defineProperty(navigator, 'webdriver', { get: () => false })

      // Spoof plugins (empty in headless, present in real Chrome)
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ]
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = plugins.map(p => {
            const plugin = { name: p.name, filename: p.filename, description: p.description, length: 0 } as Plugin
            return plugin
          })
          Object.setPrototypeOf(arr, PluginArray.prototype)
          return arr
        },
      })

      // Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })

      // Hardware concurrency (randomize slightly)
      const cores = [2, 4, 6, 8, 12, 16][Math.floor(Math.random() * 6)]
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores })

      // Device memory
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
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
