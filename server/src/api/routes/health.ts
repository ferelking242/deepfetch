import type { FastifyInstance } from 'fastify'
import os from 'node:os'
import type { ResourceManager } from '../../core/ResourceManager.js'
import type { BrowserPool } from '../../core/BrowserPool.js'
import type { JobQueue } from '../../core/JobQueue.js'
import type { SystemHealth } from '../../types/index.js'

export function registerHealthRoutes(
  fastify: FastifyInstance,
  deps: { resources: ResourceManager; pool: BrowserPool; queue: JobQueue }
): void {
  const { resources, pool, queue } = deps

  fastify.get('/v1/health', async (_req, reply) => {
    const snap = resources.getSnapshot()
    const poolStats = pool.getStats()

    const health: SystemHealth = {
      status: resources.isPaused() ? 'degraded' : 'ok',
      cpu_pct: snap.cpuPct,
      ram_pct: snap.ramPct,
      ram_used_gb: parseFloat(snap.ramUsedGb.toFixed(2)),
      ram_total_gb: parseFloat(snap.ramTotalGb.toFixed(2)),
      pool_size: poolStats.total,
      pool_active: poolStats.active,
      pool_max: poolStats.max,
      queue_depth: queue.queueDepth(),
      queue_running: queue.runningCount(),
      uptime_seconds: Math.floor(process.uptime()),
    }

    return reply.send(health)
  })

}
