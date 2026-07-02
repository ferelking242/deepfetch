import { createHash } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { getDb } from '../../db/index.js'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers['authorization']
  const apiKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (request.headers['x-api-key'] as string | undefined)

  if (!apiKey) {
    return reply.status(401).send({ error: 'Missing API key. Pass it as Authorization: Bearer <key> or X-Api-Key header.' })
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const db = getDb()

  const row = db.prepare('SELECT id, rate_limit_per_minute FROM api_keys WHERE key_hash=?').get(keyHash) as
    | { id: string; rate_limit_per_minute: number }
    | undefined

  if (!row) {
    return reply.status(401).send({ error: 'Invalid API key.' })
  }

  // Update last_used
  db.prepare('UPDATE api_keys SET last_used=? WHERE id=?').run(Date.now(), row.id)

  // Attach key info to request for rate limiter
  ;(request as FastifyRequest & { keyId: string; rateLimitPerMin: number }).keyId = row.id
  ;(request as FastifyRequest & { keyId: string; rateLimitPerMin: number }).rateLimitPerMin = row.rate_limit_per_minute
}
