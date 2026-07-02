import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { SessionStore } from '../../sessions/SessionStore.js'
import type { SessionValidator } from '../../sessions/SessionValidator.js'
import type { LoginAgent } from '../../sessions/LoginAgent.js'

const CreateSessionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cookies'),
    platform: z.string(),
    label: z.string(),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
      path: z.string().default('/'),
      secure: z.boolean().optional(),
      httpOnly: z.boolean().optional(),
      expires: z.number().optional(),
    })),
  }),
  z.object({
    type: z.literal('credentials'),
    platform: z.string(),
    label: z.string().optional(),
    username: z.string(),
    password: z.string(),
  }),
])

export function registerSessionRoutes(
  fastify: FastifyInstance,
  deps: { store: SessionStore; validator: SessionValidator; loginAgent: LoginAgent }
): void {
  const { store, validator, loginAgent } = deps

  fastify.get('/v1/sessions', async (req, reply) => {
    const { platform } = req.query as { platform?: string }
    const sessions = store.list(platform)
    // Never expose decrypted cookies/credentials in the list
    return reply.send({
      sessions: sessions.map(s => ({
        id: s.id,
        platform: s.platform,
        label: s.label,
        status: s.status,
        has_credentials: s.credentials !== null,
        cookie_count: s.cookies.length,
        last_checked: s.last_checked,
        created_at: s.created_at,
      })),
    })
  })

  fastify.post('/v1/sessions', async (req, reply) => {
    const body = CreateSessionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    if (body.data.type === 'cookies') {
      const session = store.create({
        platform: body.data.platform,
        label: body.data.label,
        cookies: body.data.cookies,
      })
      return reply.status(201).send({
        id: session.id,
        platform: session.platform,
        label: session.label,
        status: session.status,
        cookie_count: session.cookies.length,
      })
    }

    // Credentials flow → automated login
    const result = await loginAgent.login({
      platform: body.data.platform,
      username: body.data.username,
      password: body.data.password,
      label: body.data.label,
    })

    if (!result.success) {
      return reply.status(400).send({ error: result.error ?? 'Login failed' })
    }

    return reply.status(201).send({
      id: result.session_id,
      platform: body.data.platform,
      message: 'Login successful, session created',
    })
  })

  fastify.get('/v1/sessions/:id/check', async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = store.get(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    const valid = await validator.check(session)
    return reply.send({ id, status: valid ? 'active' : 'expired', valid })
  })

  fastify.delete('/v1/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const deleted = store.delete(id)
    if (!deleted) return reply.status(404).send({ error: 'Session not found' })
    return reply.send({ message: 'Session deleted', id })
  })
}
