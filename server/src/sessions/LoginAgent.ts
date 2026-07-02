import type { Logger } from 'pino'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { SessionStore } from './SessionStore.js'
import type { CookieEntry } from '../types/index.js'

interface LoginStrategy {
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
  loginUrl: string
  successCheck: (html: string) => boolean
  waitAfterSubmit?: number
}

const LOGIN_STRATEGIES: Record<string, LoginStrategy> = {
  instagram: {
    loginUrl: 'https://www.instagram.com/accounts/login/',
    usernameSelector: 'input[name="username"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: 'button[type="submit"]',
    successCheck: html => html.includes('"isLoggedIn":true') || !html.includes('login'),
    waitAfterSubmit: 3000,
  },
  tiktok: {
    loginUrl: 'https://www.tiktok.com/login/phone-or-email/email',
    usernameSelector: 'input[name="username"]',
    passwordSelector: 'input[type="password"]',
    submitSelector: 'button[type="submit"]',
    successCheck: html => html.includes('"user":{') || !html.includes('"isLoginPage"'),
    waitAfterSubmit: 4000,
  },
  reddit: {
    loginUrl: 'https://www.reddit.com/login/',
    usernameSelector: '#loginUsername',
    passwordSelector: '#loginPassword',
    submitSelector: 'button[type="submit"]',
    successCheck: html => html.includes('"is_employee"'),
    waitAfterSubmit: 2000,
  },
}

export class LoginAgent {
  constructor(
    private readonly store: SessionStore,
    private readonly pool: BrowserPool,
    private readonly logger: Logger
  ) {}

  async login(params: {
    platform: string
    username: string
    password: string
    label?: string
  }): Promise<{ session_id: string; success: boolean; error?: string }> {
    const strategy = LOGIN_STRATEGIES[params.platform]
    if (!strategy) {
      return { session_id: '', success: false, error: `No login strategy for platform: ${params.platform}` }
    }

    let context: import('playwright').BrowserContext | null = null

    try {
      context = await this.pool.acquire()
      const page = await context.newPage()

      this.logger.info({ platform: params.platform, username: params.username }, 'Attempting login')

      await page.goto(strategy.loginUrl, { waitUntil: 'networkidle', timeout: 20_000 })

      // Fill credentials with human-like timing
      await page.fill(strategy.usernameSelector, params.username, { timeout: 10_000 })
      await page.waitForTimeout(300 + Math.random() * 500)
      await page.fill(strategy.passwordSelector, params.password, { timeout: 10_000 })
      await page.waitForTimeout(200 + Math.random() * 400)
      await page.click(strategy.submitSelector)

      // Wait for redirect / page load
      await page.waitForTimeout(strategy.waitAfterSubmit ?? 2000)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null)

      const html = await page.content()
      const success = strategy.successCheck(html)

      if (!success) {
        await page.close()
        return { session_id: '', success: false, error: 'Login check failed — wrong credentials or captcha required' }
      }

      // Extract cookies
      const rawCookies = await context.cookies()
      const cookies: CookieEntry[] = rawCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expires: c.expires,
      }))

      await page.close()

      // Persist session (store encrypted password for auto-refresh)
      const session = this.store.create({
        platform: params.platform,
        label: params.label ?? `${params.platform}:${params.username}`,
        cookies,
        credentials: { username: params.username, password: params.password },
      })

      this.logger.info({ session_id: session.id, platform: params.platform }, 'Login successful, session created')
      return { session_id: session.id, success: true }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error({ err, platform: params.platform }, 'Login error')
      return { session_id: '', success: false, error: msg }
    } finally {
      if (context) await this.pool.release(context)
    }
  }
}
