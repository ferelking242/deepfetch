import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import { getDb } from '../db/index.js'
import { getConfig } from '../config/loader.js'
import type { Job, JobPriority, ScrapeOptions, JobStatus } from '../types/index.js'

const PRIORITY_ORDER: Record<JobPriority, number> = { high: 0, normal: 1, batch: 2 }

export class JobQueue {
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  enqueue(params: {
    url: string
    platform?: string
    priority?: JobPriority
    session_id?: string
    options?: Partial<ScrapeOptions>
  }): Job {
    const db = getDb()
    const cfg = getConfig()

    const job: Job = {
      id: randomUUID(),
      url: params.url,
      platform: params.platform ?? 'generic',
      status: 'queued',
      priority: params.priority ?? 'normal',
      session_id: params.session_id ?? null,
      options: {
        output: params.options?.output ?? ['json'],
        extract: params.options?.extract,
        max_comments: params.options?.max_comments ?? 20,
        scroll: params.options?.scroll ?? false,
        wait_for: params.options?.wait_for,
        timeout_ms: params.options?.timeout_ms ?? cfg.browser.navigation_timeout_ms,
      },
      result: null,
      error: null,
      retries: 0,
      created_at: Date.now(),
      started_at: null,
      finished_at: null,
    }

    db.prepare(`
      INSERT INTO jobs (id, url, platform, status, priority, session_id, options_json, retries, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.url, job.platform, job.status, job.priority, job.session_id, JSON.stringify(job.options), job.retries, job.created_at)

    this.logger.debug({ job_id: job.id, url: job.url, priority: job.priority }, 'Job enqueued')
    return job
  }

  /** Pull the next job ready to run (highest priority first, FIFO within same priority) */
  dequeue(): Job | null {
    const db = getDb()

    const row = db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'queued'
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
        created_at ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined

    if (!row) return null

    // Mark as running
    db.prepare(`UPDATE jobs SET status='running', started_at=? WHERE id=?`)
      .run(Date.now(), row.id as string)

    return this.rowToJob({ ...row, status: 'running' })
  }

  complete(jobId: string, result: Job['result']): void {
    const db = getDb()
    db.prepare(`
      UPDATE jobs SET status='done', result_json=?, finished_at=? WHERE id=?
    `).run(JSON.stringify(result), Date.now(), jobId)
  }

  fail(jobId: string, error: string): void {
    const db = getDb()
    const cfg = getConfig()

    const row = db.prepare('SELECT retries FROM jobs WHERE id=?').get(jobId) as { retries: number } | undefined
    if (!row) return

    const retries = row.retries + 1
    if (retries <= cfg.queue.max_retries) {
      const delay = cfg.queue.retry_base_delay_ms * Math.pow(2, retries - 1)
      db.prepare(`
        UPDATE jobs SET status='queued', error=?, retries=?, started_at=NULL,
          created_at=? WHERE id=?
      `).run(error, retries, Date.now() + delay, jobId)
      this.logger.warn({ job_id: jobId, retries, delay_ms: delay }, 'Job failed, will retry')
    } else {
      db.prepare(`UPDATE jobs SET status='failed', error=?, finished_at=? WHERE id=?`)
        .run(error, Date.now(), jobId)
      this.logger.error({ job_id: jobId, error }, 'Job permanently failed')
    }
  }

  cancel(jobId: string): boolean {
    const db = getDb()
    const result = db.prepare(`UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status='queued'`)
      .run(Date.now(), jobId)
    return result.changes > 0
  }

  getJob(id: string): Job | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToJob(row) : null
  }

  listJobs(params: { status?: JobStatus; platform?: string; limit?: number; offset?: number } = {}): Job[] {
    const db = getDb()
    const conditions: string[] = []
    const values: unknown[] = []

    if (params.status) { conditions.push('status=?'); values.push(params.status) }
    if (params.platform) { conditions.push('platform=?'); values.push(params.platform) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    const rows = db.prepare(`SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...values, limit, offset) as Record<string, unknown>[]

    return rows.map(r => this.rowToJob(r))
  }

  queueDepth(): number {
    const db = getDb()
    const row = db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE status='queued'`).get() as { n: number }
    return row.n
  }

  runningCount(): number {
    const db = getDb()
    const row = db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE status='running'`).get() as { n: number }
    return row.n
  }

  /** Clean up old completed/failed jobs past TTL */
  cleanup(): void {
    const db = getDb()
    const cfg = getConfig()
    const cutoff = Date.now() - cfg.queue.result_ttl_seconds * 1000
    const result = db.prepare(`DELETE FROM jobs WHERE status IN ('done','failed','cancelled') AND finished_at < ?`).run(cutoff)
    if (result.changes > 0) {
      this.logger.debug({ deleted: result.changes }, 'Cleaned up old jobs')
    }
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      url: row.url as string,
      platform: row.platform as string,
      status: row.status as JobStatus,
      priority: row.priority as JobPriority,
      session_id: row.session_id as string | null,
      options: JSON.parse(row.options_json as string),
      result: row.result_json ? JSON.parse(row.result_json as string) : null,
      error: row.error as string | null,
      retries: row.retries as number,
      created_at: row.created_at as number,
      started_at: row.started_at as number | null,
      finished_at: row.finished_at as number | null,
    }
  }
}
