import { createHash } from 'node:crypto'
  import type { FastifyRequest, FastifyReply } from 'fastify'
  import { getDb } from '../../db/index.js'

  export function authMiddleware(masterSecret?: string) {
    return async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const authHeader = request.headers['authorization']
      const apiKey = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (request.headers['x-api-key'] as string | undefined)

      if (!apiKey) {
        return reply.status(401).send({ error: 'Missing API key. Pass as Authorization: Bearer <key> or X-Api-Key header.' })
      }

      // Master secret bypass — full admin access (create keys, etc.)
      if (masterSecret && apiKey === masterSecret) {
        ;(request as any).keyId = 'master'
        ;(request as any).rateLimitPerMin = 10_000
        return
      }

      const keyHash = createHash('sha256').update(apiKey).digest('hex')
      const db = getDb()

      const row = db.prepare('SELECT id, rate_limit_per_minute FROM api_keys WHERE key_hash=?').get(keyHash) as
        | { id: string; rate_limit_per_minute: number }
        | undefined

      if (!row) {
        return reply.status(401).send({ error: 'Invalid API key.' })
      }

      // Check expiry
      if ((row as any).expires_at && (row as any).expires_at < Date.now()) {
        return reply.status(401).send({ error: 'API key has expired.' })
      }

      db.prepare('UPDATE api_keys SET last_used=? WHERE id=?').run(Date.now(), row.id)
      ;(request as any).keyId = row.id
      ;(request as any).rateLimitPerMin = row.rate_limit_per_minute
      ;(request as any).scopes = ((row as any).scopes ?? '*').split(',').filter(Boolean)
    }
  }
  