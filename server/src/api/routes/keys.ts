import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID, createHash, randomBytes } from 'node:crypto'
import { getDb } from '../../db/index.js'

const CreateKeySchema = z.object({
  label: z.string().min(1).max(100),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).default(60),
})

export function registerKeyRoutes(fastify: FastifyInstance): void {
  fastify.get('/v1/keys', async (_req, reply) => {
    const db = getDb()
    const keys = db.prepare(
      'SELECT id, label, rate_limit_per_minute, created_at, last_used FROM api_keys ORDER BY created_at DESC'
    ).all() as Array<{ id: string; label: string; rate_limit_per_minute: number; created_at: number; last_used: number | null }>
    return reply.send({ keys })
  })

  fastify.post('/v1/keys', async (req, reply) => {
    const body = CreateKeySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { label, rate_limit_per_minute } = body.data

    // Generate a secure random key: df_ + 32 random bytes as hex
    const rawKey = 'df_' + randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const db = getDb()
    const id = randomUUID()
    const now = Date.now()

    db.prepare(
      'INSERT INTO api_keys (id, key_hash, label, rate_limit_per_minute, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, keyHash, label, rate_limit_per_minute, now)

    // Return the raw key ONCE — it cannot be retrieved again
    return reply.status(201).send({
      id,
      key: rawKey,
      label,
      rate_limit_per_minute,
      warning: 'Save this key now — it will not be shown again.',
    })
  })

  fastify.delete('/v1/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const result = db.prepare('DELETE FROM api_keys WHERE id=?').run(id)
    if (result.changes === 0) return reply.status(404).send({ error: 'API key not found' })
    return reply.send({ message: 'API key revoked', id })
  })
}
