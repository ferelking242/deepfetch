import Fastify from 'fastify'
  import fastifyWebsocket from '@fastify/websocket'
  import fastifyCors from '@fastify/cors'
  import fastifyStatic from '@fastify/static'
  import fastifySwagger from '@fastify/swagger'
  import fastifySwaggerUi from '@fastify/swagger-ui'
  import path from 'node:path'
  import { fileURLToPath } from 'node:url'
  import fs from 'node:fs'
  import pino from 'pino'

  import { loadConfig } from './config/loader.js'
  import { getDb, closeDb } from './db/index.js'
  import { ResourceManager } from './core/ResourceManager.js'
  import { BrowserPool } from './core/BrowserPool.js'
  import { JobQueue } from './core/JobQueue.js'
  import { JobWorker } from './core/JobWorker.js'
  import { PlatformRegistry } from './platforms/registry.js'
  import { AIEngine } from './ai/AIEngine.js'
  import { SessionStore } from './sessions/SessionStore.js'
  import { SessionValidator } from './sessions/SessionValidator.js'
  import { LoginAgent } from './sessions/LoginAgent.js'

  import { registerHealthRoutes } from './api/routes/health.js'
  import { registerJobRoutes } from './api/routes/jobs.js'
  import { registerScrapeRoutes } from './api/routes/scrape.js'
  import { registerBatchRoutes } from './api/routes/batch.js'
  import { registerCrawlRoutes } from './api/routes/crawl.js'
  import { registerSessionRoutes } from './api/routes/sessions.js'
  import { registerKeyRoutes } from './api/routes/keys.js'
  import { registerWebSocketRoutes } from './api/websocket/jobStream.js'
  import { authMiddleware } from './api/middleware/auth.js'

  const __dirname = path.dirname(fileURLToPath(import.meta.url))

  async function main() {
    const cfg = loadConfig()

    // Use pino directly — avoids FastifyBaseLogger ↔ pino.Logger type mismatch
    const logger = pino({ level: 'info' })

    // ── Bootstrap core services ──────────────────────────────────────────────
    const resources = new ResourceManager(logger)
    await resources.startMonitoring()

    const poolMax = resources.getPoolMax()
    const pool = new BrowserPool(poolMax, logger)
    await pool.init()

    const queue = new JobQueue(logger)
    const aiEngine = new AIEngine(logger)
    const sessionStore = new SessionStore()

    const registry = new PlatformRegistry(pool, aiEngine, logger)
    const sessionValidator = new SessionValidator(sessionStore, pool, logger)
    const loginAgent = new LoginAgent(sessionStore, pool, logger)

    const worker = new JobWorker(queue, pool, resources, registry, logger)
    worker.start()

    // Periodic cleanup every 30 min
    setInterval(() => queue.cleanup(), 30 * 60 * 1000)

    // Periodic session validation
    sessionValidator.startPeriodicChecks()

    // ── Fastify setup ─────────────────────────────────────────────────────────
    const fastify = Fastify({
      logger: { level: 'info' },
      trustProxy: true,
    })

    await fastify.register(fastifyCors, { origin: true })
    await fastify.register(fastifyWebsocket)

    // OpenAPI docs
    await fastify.register(fastifySwagger, {
      openapi: {
        info: { title: 'DeepFetch API', version: '1.0.0', description: 'Universal scraping & automation engine' },
        servers: [{ url: `http://localhost:${cfg.server.port}` }],
      },
    })
    await fastify.register(fastifySwaggerUi, { routePrefix: '/docs' })

    // Serve React dashboard (built files)
    const dashboardDist = path.join(__dirname, '..', '..', '..', 'dashboard', 'dist')
    if (fs.existsSync(dashboardDist)) {
      await fastify.register(fastifyStatic, { root: dashboardDist, prefix: '/dashboard', decorateReply: false })
      fastify.get('/dashboard/*', (_req, reply) => reply.sendFile('index.html', dashboardDist))
    }

    // Serve screenshots
    const screenshotsDir = path.join(process.cwd(), 'data', 'screenshots')
    fs.mkdirSync(screenshotsDir, { recursive: true })
    await fastify.register(fastifyStatic, { root: screenshotsDir, prefix: '/screenshots', decorateReply: false })

    // ── Public routes (no auth required) ─────────────────────────────────────
    registerHealthRoutes(fastify, { resources, pool, queue })

    // ── Protected routes (require valid API key) ──────────────────────────────
    await fastify.register(async (protected_) => {
      protected_.addHook('preHandler', authMiddleware)

      registerJobRoutes(protected_, { queue })
      registerScrapeRoutes(protected_, { queue, pool, registry, sessionStore, resources, aiEngine })
      registerBatchRoutes(protected_, { queue, registry, sessionStore })
      registerCrawlRoutes(protected_, { queue, registry })
      registerSessionRoutes(protected_, { store: sessionStore, validator: sessionValidator, loginAgent })
      registerKeyRoutes(protected_)
      registerWebSocketRoutes(protected_, { queue })

      // Platform list endpoint
      protected_.get('/v1/platforms', async (_req, reply) => {
        return reply.send({ platforms: registry.list() })
      })
    })

    // Root info
    fastify.get('/', async (_req, reply) => {
      return reply.send({
        name: 'DeepFetch',
        version: '1.0.0',
        docs: '/docs',
        dashboard: '/dashboard',
        health: '/v1/health',
      })
    })

    // ── Start server ──────────────────────────────────────────────────────────
    await fastify.listen({ port: cfg.server.port, host: cfg.server.host })
    fastify.log.info(`DeepFetch running on http://${cfg.server.host}:${cfg.server.port}`)
    fastify.log.info(`Dashboard: http://localhost:${cfg.server.port}/dashboard`)
    fastify.log.info(`API Docs:  http://localhost:${cfg.server.port}/docs`)

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal: string) => {
      fastify.log.info({ signal }, 'Shutting down gracefully...')
      worker.stop()
      await fastify.close()
      await pool.shutdown()
      resources.stopMonitoring()
      closeDb()
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT',  () => shutdown('SIGINT'))
  }

  main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  