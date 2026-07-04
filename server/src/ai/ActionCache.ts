/**
 * ActionCache — SQLite-backed cache for AI-resolved browser actions.
 * Key = sha256(hostname | instruction_normalized)
 * Inspired by Stagehand's auto-caching / self-healing approach.
 */
import { createHash } from 'node:crypto'
import { getDb } from '../db/index.js'

export interface CachedAction {
  selector: string
  action_type: string
  value: string | null
}

export class ActionCache {
  constructor() {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS action_cache (
        key        TEXT PRIMARY KEY,
        selector   TEXT NOT NULL,
        action_type TEXT NOT NULL,
        value      TEXT,
        hit_count  INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used  INTEGER NOT NULL
      )
    `)
  }

  private makeKey(hostname: string, instruction: string): string {
    const raw = `${hostname}|${instruction.toLowerCase().replace(/\s+/g, ' ').trim()}`
    return createHash('sha256').update(raw).digest('hex').slice(0, 32)
  }

  get(hostname: string, instruction: string): CachedAction | null {
    const key = this.makeKey(hostname, instruction)
    const db = getDb()
    const row = db.prepare(
      'SELECT selector, action_type, value FROM action_cache WHERE key = ?'
    ).get(key) as CachedAction | undefined

    if (row) {
      db.prepare('UPDATE action_cache SET hit_count = hit_count + 1, last_used = ? WHERE key = ?')
        .run(Date.now(), key)
    }
    return row ?? null
  }

  set(hostname: string, instruction: string, action: CachedAction): void {
    const key = this.makeKey(hostname, instruction)
    getDb().prepare(`
      INSERT INTO action_cache (key, selector, action_type, value, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        selector = excluded.selector,
        action_type = excluded.action_type,
        value = excluded.value,
        last_used = excluded.last_used
    `).run(key, action.selector, action.action_type, action.value ?? null, Date.now(), Date.now())
  }

  evict(olderThanMs = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs
    const info = getDb().prepare('DELETE FROM action_cache WHERE last_used < ?').run(cutoff)
    return info.changes
  }

  stats() {
    return getDb().prepare(
      'SELECT COUNT(*) as total, SUM(hit_count) as hits FROM action_cache'
    ).get() as { total: number; hits: number }
  }

  list(limit = 100) {
    return getDb().prepare(
      'SELECT key, selector, action_type, hit_count, created_at, last_used FROM action_cache ORDER BY last_used DESC LIMIT ?'
    ).all(limit)
  }

  delete(key: string): boolean {
    const info = getDb().prepare('DELETE FROM action_cache WHERE key = ?').run(key)
    return info.changes > 0
  }

  clear(): void {
    getDb().prepare('DELETE FROM action_cache').run()
  }
}
