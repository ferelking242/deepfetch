import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Logger } from 'pino'
import { getDb } from '../db/index.js'
import { getConfig } from '../config/loader.js'
import type { Session, CookieEntry, Credentials } from '../types/index.js'

const ALGORITHM = 'aes-256-gcm'

export class SessionStore {
  private get key(): Buffer {
    const cfg = getConfig()
    const hex = cfg.sessions.encryption_key
    if (!hex || hex.length < 64) {
      throw new Error('sessions.encryption_key must be a 32-byte hex string (64 hex chars). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    }
    return Buffer.from(hex, 'hex')
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
    return iv.toString('hex') + tag.toString('hex') + enc.toString('hex')
  }

  private decrypt(data: string): string {
    const iv = Buffer.from(data.slice(0, 24), 'hex')
    const tag = Buffer.from(data.slice(24, 56), 'hex')
    const ciphertext = Buffer.from(data.slice(56), 'hex')
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  }

  create(params: {
    platform: string
    label: string
    cookies?: CookieEntry[]
    credentials?: { username: string; password: string }
  }): Session {
    const db = getDb()
    const now = Date.now()

    const session: Session = {
      id: randomUUID(),
      platform: params.platform,
      label: params.label,
      cookies: params.cookies ?? [],
      credentials: params.credentials
        ? { username: params.credentials.username, password: params.credentials.password }
        : null,
      status: 'active',
      last_checked: now,
      created_at: now,
    }

    const cookiesEnc = this.encrypt(JSON.stringify(session.cookies))
    const credentialsEnc = session.credentials
      ? this.encrypt(JSON.stringify(session.credentials))
      : null

    db.prepare(`
      INSERT INTO sessions (id, platform, label, cookies_enc, credentials_enc, status, last_checked, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(session.id, session.platform, session.label, cookiesEnc, credentialsEnc, session.status, now, now)

    return session
  }

  get(id: string): Session | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToSession(row) : null
  }

  list(platform?: string): Session[] {
    const db = getDb()
    const rows = platform
      ? db.prepare('SELECT * FROM sessions WHERE platform=? ORDER BY created_at DESC').all(platform) as Record<string, unknown>[]
      : db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as Record<string, unknown>[]
    return rows.map(r => this.rowToSession(r))
  }

  updateStatus(id: string, status: Session['status']): void {
    const db = getDb()
    db.prepare('UPDATE sessions SET status=?, last_checked=? WHERE id=?').run(status, Date.now(), id)
  }

  updateCookies(id: string, cookies: CookieEntry[]): void {
    const db = getDb()
    const enc = this.encrypt(JSON.stringify(cookies))
    db.prepare('UPDATE sessions SET cookies_enc=?, last_checked=? WHERE id=?').run(enc, Date.now(), id)
  }

  delete(id: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM sessions WHERE id=?').run(id)
    return result.changes > 0
  }

  private rowToSession(row: Record<string, unknown>): Session {
    const cookies: CookieEntry[] = JSON.parse(this.decrypt(row.cookies_enc as string))
    const credentials: Credentials | null = row.credentials_enc
      ? JSON.parse(this.decrypt(row.credentials_enc as string))
      : null

    return {
      id: row.id as string,
      platform: row.platform as string,
      label: row.label as string,
      cookies,
      credentials,
      status: row.status as Session['status'],
      last_checked: row.last_checked as number,
      created_at: row.created_at as number,
    }
  }
}
