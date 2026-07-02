import os from 'node:os'
import si from 'systeminformation'
import type { Logger } from 'pino'
import { getConfig } from '../config/loader.js'

export interface ResourceSnapshot {
  cpuPct: number
  ramPct: number
  ramUsedGb: number
  ramTotalGb: number
}

export class ResourceManager {
  private poolMax: number
  private monitorInterval: ReturnType<typeof setInterval> | null = null
  private lastSnapshot: ResourceSnapshot = { cpuPct: 0, ramPct: 0, ramUsedGb: 0, ramTotalGb: 0 }
  private paused = false
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.poolMax = this.computePoolMax()
  }

  private computePoolMax(): number {
    const cfg = getConfig()

    // Manual override
    if (cfg.browser.pool_max > 0) {
      this.logger.info({ pool_max: cfg.browser.pool_max }, 'Browser pool size set manually')
      return cfg.browser.pool_max
    }

    const ramGb = os.totalmem() / 1e9
    const cores = os.cpus().length

    // Each Chromium context on a heavy page (TikTok, YouTube) uses ~350MB RAM and ~0.5 CPU core
    const byRam = Math.floor((ramGb * 0.60) / 0.35)
    const byCpu = Math.floor(cores * 0.75)
    const computed = Math.min(byRam, byCpu, 12) // hard cap at 12
    const safe = Math.max(1, computed)

    this.logger.info(
      { ram_gb: ramGb.toFixed(1), cores, by_ram: byRam, by_cpu: byCpu, pool_max: safe },
      'Auto-detected browser pool size'
    )

    return safe
  }

  getPoolMax(): number {
    return this.poolMax
  }

  getSnapshot(): ResourceSnapshot {
    return this.lastSnapshot
  }

  isPaused(): boolean {
    return this.paused
  }

  async startMonitoring(): Promise<void> {
    // Initial snapshot
    await this.refresh()

    this.monitorInterval = setInterval(async () => {
      await this.refresh()
    }, 10_000) // every 10 seconds
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
  }

  private async refresh(): Promise<void> {
    const cfg = getConfig()

    try {
      const [cpuLoad, mem] = await Promise.all([
        si.currentLoad(),
        si.mem(),
      ])

      const cpuPct = Math.round(cpuLoad.currentLoad)
      const ramUsedGb = (mem.active) / 1e9
      const ramTotalGb = mem.total / 1e9
      const ramPct = Math.round((mem.active / mem.total) * 100)

      this.lastSnapshot = { cpuPct, ramPct, ramUsedGb, ramTotalGb }

      const wasPaused = this.paused

      if (cpuPct > cfg.resources.cpu_threshold_pct || ramPct > cfg.resources.ram_threshold_pct) {
        this.paused = true
        if (!wasPaused) {
          this.logger.warn({ cpuPct, ramPct }, 'Resource threshold exceeded — pausing new jobs')
        }
      } else {
        this.paused = false
        if (wasPaused) {
          this.logger.info({ cpuPct, ramPct }, 'Resources recovered — resuming job intake')
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to read system resources')
    }
  }
}
