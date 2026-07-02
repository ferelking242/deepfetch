import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { JobQueue } from '../../core/JobQueue.js'
import type { JobStatus } from '../../types/index.js'

const ListQuerySchema = z.object({
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']).optional(),
  platform: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export function registerJobRoutes(fastify: FastifyInstance, deps: { queue: JobQueue }): void {
  const { queue } = deps

  fastify.get('/v1/jobs', async (req, reply) => {
    const query = ListQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })

    const jobs = queue.listJobs({
      status: query.data.status as JobStatus | undefined,
      platform: query.data.platform,
      limit: query.data.limit,
      offset: query.data.offset,
    })

    return reply.send({ jobs, count: jobs.length })
  })

  fastify.get('/v1/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const job = queue.getJob(id)
    if (!job) return reply.status(404).send({ error: 'Job not found' })
    return reply.send(job)
  })

  fastify.delete('/v1/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const cancelled = queue.cancel(id)
    if (!cancelled) return reply.status(404).send({ error: 'Job not found or not cancellable' })
    return reply.send({ message: 'Job cancelled', id })
  })
}
