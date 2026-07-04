import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID, createHash, randomBytes } from 'node:crypto'
import { getDb } from '../../db/index.js'

// ── Constants ──────────────────────────────────────────────────────────────────

export const VALID_SCOPES = ['scrape', 'crawl', 'read', 'admin', '*'] as const
export type Scope = typeof VALID_SCOPES[number]

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateKeySchema = z.object({
  label: z.string().min(1).max(100),
  scopes: z.array(z.enum(['scrape', 'crawl', 'read', 'admin', '*'])).min(1).default(['*']),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).default(60),
  expires_in_days: z.number().int().min(1).max(3650).optional(),
})

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Generate a DeepFetch API key.
 * Format: dfk_<32-byte-hex>  (70 chars total — recognisable prefix like ghp_ / sk-)
 */
function generateToken(): string {
  return 'dfk_' + randomBytes(32).toString('hex')
}

// ── DB helper ─────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string
  label: string
  scopes: string
  rate_limit_per_minute: number
  expires_at: number | null
  created_at: number
  last_used: number | null
}

// ── Routes ────────────────────────────────────────────────────────────────────

export function registerKeyRoutes(fastify: FastifyInstance): void {

  // GET /v1/keys — list all keys (hashes hidden)
  fastify.get('/v1/keys', async (_req, reply) => {
    const db = getDb()

    // Ensure scopes column exists (migration for old installs)
    try {
      db.prepare('ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT \'*\'').run()
    } catch { /* column already exists */ }
    try {
      db.prepare('ALTER TABLE api_keys ADD COLUMN expires_at INTEGER').run()
    } catch { /* column already exists */ }

    const keys = db.prepare(
      `SELECT id, label, scopes, rate_limit_per_minute, expires_at, created_at, last_used
       FROM api_keys ORDER BY created_at DESC`
    ).all() as ApiKeyRow[]

    return reply.send({
      keys: keys.map(k => ({
        ...k,
        scopes: k.scopes.split(',').filter(Boolean),
        expired: k.expires_at ? k.expires_at < Date.now() : false,
      })),
    })
  })

  // POST /v1/keys — create a new key
  fastify.post('/v1/keys', async (req, reply) => {
    const body = CreateKeySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { label, scopes, rate_limit_per_minute, expires_in_days } = body.data

    const rawKey = generateToken()
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const db = getDb()
    const id = randomUUID()
    const now = Date.now()
    const expiresAt = expires_in_days ? now + expires_in_days * 86_400_000 : null

    // Ensure migration
    try { db.prepare('ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT \'*\'').run() } catch { /* ok */ }
    try { db.prepare('ALTER TABLE api_keys ADD COLUMN expires_at INTEGER').run() } catch { /* ok */ }

    db.prepare(
      `INSERT INTO api_keys (id, key_hash, label, scopes, rate_limit_per_minute, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, keyHash, label, scopes.join(','), rate_limit_per_minute, expiresAt, now)

    // Return raw key ONCE — never stored, only the hash is kept
    return reply.status(201).send({
      id,
      key: rawKey,
      label,
      scopes,
      rate_limit_per_minute,
      expires_at: expiresAt,
      warning: 'Save this key now — it will never be shown again.',
    })
  })

  // DELETE /v1/keys/:id — revoke a key
  fastify.delete('/v1/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const result = db.prepare('DELETE FROM api_keys WHERE id=?').run(id)
    if (result.changes === 0) return reply.status(404).send({ error: 'API key not found' })
    return reply.send({ message: 'Key revoked', id })
  })

  // GET /v1/auth/whoami — identify current key / check scopes
  fastify.get('/v1/auth/whoami', async (req, reply) => {
    const r = req as any
    if (r.keyId === 'master') {
      return reply.send({
        type: 'master',
        scopes: ['*'],
        label: 'Master key',
        rate_limit_per_minute: 10_000,
        expires_at: null,
      })
    }

    const db = getDb()
    const row = db.prepare(
      `SELECT id, label, scopes, rate_limit_per_minute, expires_at FROM api_keys WHERE id=?`
    ).get(r.keyId) as ApiKeyRow | undefined

    if (!row) return reply.status(401).send({ error: 'Key not found' })

    const expired = row.expires_at ? row.expires_at < Date.now() : false
    return reply.send({
      type: 'api_key',
      id: row.id,
      label: row.label,
      scopes: row.scopes.split(',').filter(Boolean),
      rate_limit_per_minute: row.rate_limit_per_minute,
      expires_at: row.expires_at,
      expired,
    })
  })
}
