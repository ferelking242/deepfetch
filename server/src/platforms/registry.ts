import type { PlatformAdapter } from '../types/index.js'
import { GenericAdapter } from './generic.js'
import { YouTubeAdapter } from './youtube.js'
import { TikTokAdapter } from './tiktok.js'
import { InstagramAdapter } from './instagram.js'
import { RedditAdapter } from './reddit.js'
import type { BrowserPool } from '../core/BrowserPool.js'
import type { AIEngine } from '../ai/AIEngine.js'
import type { Logger } from 'pino'

export class PlatformRegistry {
  private readonly adapters: PlatformAdapter[]
  private readonly fallback: GenericAdapter

  constructor(pool: BrowserPool, aiEngine: AIEngine, logger: Logger) {
    this.fallback = new GenericAdapter(pool, aiEngine, logger)

    this.adapters = [
      new YouTubeAdapter(pool, aiEngine, logger),
      new TikTokAdapter(pool, aiEngine, logger),
      new InstagramAdapter(pool, aiEngine, logger),
      new RedditAdapter(pool, aiEngine, logger),
    ]
  }

  resolve(url: string): PlatformAdapter {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url)) return adapter
    }
    return this.fallback
  }

  list(): Array<{ name: string; domains: string[]; requiresSession: boolean }> {
    return [
      ...this.adapters.map(a => ({ name: a.name, domains: a.domains, requiresSession: a.requiresSession })),
      { name: this.fallback.name, domains: this.fallback.domains, requiresSession: this.fallback.requiresSession },
    ]
  }
}
