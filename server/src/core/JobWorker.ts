import type { Logger } from 'pino'
import type { JobQueue } from './JobQueue.js'
import type { BrowserPool } from './BrowserPool.js'
import type { ResourceManager } from './ResourceManager.js'
import { PlatformRegistry } from '../platforms/registry.js'
import { SessionStore } from '../sessions/SessionStore.js'
import type { Job } from '../types/index.js'
import { EventEmitter } from 'node:events'

export const jobEvents = new EventEmitter()

export class JobWorker {
  private running = false
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private readonly logger: Logger

  constructor(
    private readonly queue: JobQueue,
    private readonly pool: BrowserPool,
    private readonly resources: ResourceManager,
    private readonly registry: PlatformRegistry,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'JobWorker' })
  }

  start(): void {
    if (this.running) return
    this.running = true

    this.pollInterval = setInterval(() => this.tick(), 500)
    this.logger.info('JobWorker started')
  }

  stop(): void {
    this.running = false
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    if (this.resources.isPaused()) return

    const poolStats = this.pool.getStats()
    // Reserve one slot only when pool_max > 1; otherwise allow the single slot to be used
    const reserved = poolStats.max > 1 ? 1 : 0
    const available = poolStats.max - poolStats.active - reserved
    if (available <= 0) return

    const job = this.queue.dequeue()
    if (!job) return

    // Run in background — don't await, allows tick to pull next job
    this.runJob(job).catch(err => {
      this.logger.error({ err, job_id: job.id }, 'Unhandled error in runJob')
    })
  }

  private async runJob(job: Job): Promise<void> {
    const logger = this.logger.child({ job_id: job.id, url: job.url })
    logger.info('Job started')

    jobEvents.emit('job:started', job)

    const startMs = Date.now()

    try {
      // Load session if specified
      const sessionStore = new SessionStore()
      const session = job.session_id ? sessionStore.get(job.session_id) : null

      // Find platform adapter — adapters own their own context acquisition/release
      const adapter = this.registry.resolve(job.url)
      logger.info({ platform: adapter.name }, 'Using platform adapter')

      // Execute scrape (adapter acquires/releases browser context internally)
      const result = await adapter.scrape({
        job,
        session,
        logger,
      })

      result.duration_ms = Date.now() - startMs

      this.queue.complete(job.id, result)
      logger.info({ duration_ms: result.duration_ms, extracted_by: result.extracted_by }, 'Job completed')
      jobEvents.emit('job:done', { ...job, result, status: 'done' })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.queue.fail(job.id, msg)
      logger.error({ err }, 'Job failed')
      jobEvents.emit('job:failed', { ...job, error: msg, status: 'failed' })
    }
  }
}
