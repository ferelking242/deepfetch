import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { JobQueue } from '../../core/JobQueue.js'
import type { PlatformRegistry } from '../../platforms/registry.js'

const CrawlBodySchema = z.object({
  url: z.string().url(),
  depth: z.number().int().min(1).max(5).default(2),
  limit: z.number().int().min(1).max(1000).default(100),
  same_domain: z.boolean().default(true),
  exclude_patterns: z.array(z.string()).default([]),
  output: z.array(z.enum(['json', 'markdown', 'html'])).default(['json']),
  priority: z.enum(['high', 'normal', 'batch']).default('batch'),
})

export function registerCrawlRoutes(
  fastify: FastifyInstance,
  deps: { queue: JobQueue; registry: PlatformRegistry }
): void {
  const { queue, registry } = deps

  fastify.post('/v1/crawl', async (req, reply) => {
    const body = CrawlBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { url, depth, limit, same_domain, exclude_patterns, output, priority } = body.data

    // Enqueue the seed URL with crawl options
    const adapter = registry.resolve(url)
    const job = queue.enqueue({
      url,
      platform: adapter.name,
      priority,
      options: {
        output,
        crawl_depth: depth,
        crawl_limit: limit,
      },
    })

    return reply.status(202).send({
      job_id: job.id,
      seed_url: url,
      config: { depth, limit, same_domain, exclude_patterns },
      message: `Crawl job queued. Monitor at GET /v1/jobs/${job.id}`,
    })
  })
}
