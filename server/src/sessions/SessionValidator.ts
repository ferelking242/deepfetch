import type { Logger } from 'pino'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { SessionStore } from './SessionStore.js'
import type { Session } from '../types/index.js'
import { getConfig } from '../config/loader.js'

// Per-platform test URLs to validate a session (lightweight, authenticated endpoint)
const SESSION_TEST_URLS: Record<string, { url: string; check: (html: string) => boolean }> = {
  instagram: {
    url: 'https://www.instagram.com/accounts/edit/',
    check: html => html.includes('profile_edit') || html.includes('Edit Profile'),
  },
  facebook: {
    url: 'https://www.facebook.com/',
    check: html => html.includes('"isLoggedIn":true') || html.includes('profileMenuButtonLabel'),
  },
  tiktok: {
    url: 'https://www.tiktok.com/setting/',
    check: html => html.includes('account-info') || html.includes('"user":{'),
  },
  reddit: {
    url: 'https://www.reddit.com/api/me.json',
    check: html => html.includes('"is_employee"'),
  },
  twitter: {
    url: 'https://twitter.com/home',
    check: html => html.includes('"isVerified"') || html.includes('"screen_name"'),
  },
  youtube: {
    url: 'https://www.youtube.com/feed/subscriptions',
    check: html => !html.includes('accounts.google.com'),
  },
}

export class SessionValidator {
  constructor(
    private readonly store: SessionStore,
    private readonly pool: BrowserPool,
    private readonly logger: Logger
  ) {}

  async check(session: Session): Promise<boolean> {
    const test = SESSION_TEST_URLS[session.platform]
    if (!test) {
      // No test defined for this platform — assume valid
      return true
    }

    let context: import('playwright').BrowserContext | null = null
    try {
      context = await this.pool.acquire(session.cookies)
      const page = await context.newPage()

      await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      const html = await page.content()
      await page.close()

      const isValid = test.check(html)
      this.store.updateStatus(session.id, isValid ? 'active' : 'expired')
      this.logger.info({ session_id: session.id, platform: session.platform, valid: isValid }, 'Session checked')
      return isValid

    } catch (err) {
      this.logger.warn({ err, session_id: session.id }, 'Session check failed')
      this.store.updateStatus(session.id, 'invalid')
      return false
    } finally {
      if (context) await this.pool.release(context)
    }
  }

  startPeriodicChecks(): ReturnType<typeof setInterval> {
    const cfg = getConfig()
    const intervalMs = cfg.sessions.check_interval_seconds * 1000

    return setInterval(async () => {
      const sessions = this.store.list().filter(s => s.status === 'active')
      this.logger.debug({ count: sessions.length }, 'Running periodic session checks')

      for (const session of sessions) {
        await this.check(session).catch(err =>
          this.logger.error({ err, session_id: session.id }, 'Periodic session check error')
        )
      }
    }, intervalMs)
  }
}
