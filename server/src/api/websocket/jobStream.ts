import type { FastifyInstance } from 'fastify'
  import type { JobQueue } from '../../core/JobQueue.js'
  import { jobEvents } from '../../core/JobWorker.js'
  import type { Job } from '../../types/index.js'

  export function registerWebSocketRoutes(fastify: FastifyInstance, deps: { queue: JobQueue }): void {
    const { queue } = deps

    // Per-job stream
    fastify.get('/v1/jobs/:id/stream', { websocket: true }, (socket: WebSocket, req) => {
      const { id } = req.params as { id: string }

      const send = (data: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(data))
        }
      }

      const job = queue.getJob(id)
      if (!job) {
        send({ type: 'error', message: `Job ${id} not found` })
        socket.close()
        return
      }
      send({ type: 'init', job })

      if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
        socket.close()
        return
      }

      const onStarted = (j: Job) => { if (j.id === id) send({ type: 'job:started', job: j }) }
      const onDone    = (j: Job) => { if (j.id === id) { send({ type: 'job:done', job: j }); socket.close() } }
      const onFailed  = (j: Job) => { if (j.id === id) { send({ type: 'job:failed', job: j }); socket.close() } }

      jobEvents.on('job:started', onStarted)
      jobEvents.on('job:done', onDone)
      jobEvents.on('job:failed', onFailed)

      socket.on('close', () => {
        jobEvents.off('job:started', onStarted)
        jobEvents.off('job:done', onDone)
        jobEvents.off('job:failed', onFailed)
      })
    })

    // Global stream (dashboard)
    fastify.get('/v1/stream', { websocket: true }, (socket: WebSocket) => {
      const send = (data: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(data))
        }
      }

      const onStarted = (j: Job) => send({ type: 'job:started', job: j })
      const onDone    = (j: Job) => send({ type: 'job:done', job: j })
      const onFailed  = (j: Job) => send({ type: 'job:failed', job: j })

      jobEvents.on('job:started', onStarted)
      jobEvents.on('job:done', onDone)
      jobEvents.on('job:failed', onFailed)

      const hb = setInterval(() => send({ type: 'ping', ts: Date.now() }), 30_000)

      socket.on('close', () => {
        clearInterval(hb)
        jobEvents.off('job:started', onStarted)
        jobEvents.off('job:done', onDone)
        jobEvents.off('job:failed', onFailed)
      })
    })
  }
  