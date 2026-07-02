import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { JobQueue } from '../../core/JobQueue.js'
import type { PlatformRegistry } from '../../platforms/registry.js'
import type { SessionStore } from '../../sessions/SessionStore.js'

const BatchBodySchema = z.object({
  urls: z.array(z.string().url()).min(1).max(500),
  session_id: z.string().uuid().optional(),
  priority: z.enum(['high', 'normal', 'batch']).default('batch'),
  output: z.array(z.enum(['json', 'markdown', 'html', 'screenshot'])).default(['json']),
  options: z.object({
    max_comments: z.number().int().min(0).max(200).default(0),
    scroll: z.boolean().default(false),
    timeout_ms: z.number().int().min(1000).max(120_000).optional(),
  }).default({}),
})

export function registerBatchRoutes(
  fastify: FastifyInstance,
  deps: { queue: JobQueue; registry: PlatformRegistry; sessionStore: SessionStore }
): void {
  const { queue, registry, sessionStore } = deps

  fastify.post('/v1/batch', async (req, reply) => {
    const body = BatchBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { urls, session_id, priority, output, options } = body.data

    if (session_id && !sessionStore.get(session_id)) {
      return reply.status(404).send({ error: `Session ${session_id} not found` })
    }

    const jobs = urls.map(url => {
      const adapter = registry.resolve(url)
      return queue.enqueue({ url, platform: adapter.name, priority, session_id, options: { ...options, output } })
    })

    return reply.status(202).send({
      job_ids: jobs.map(j => j.id),
      count: jobs.length,
      message: `${jobs.length} jobs queued. Poll /v1/jobs?status=done to collect results.`,
    })
  })
}
