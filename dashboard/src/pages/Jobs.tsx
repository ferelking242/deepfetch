import { useState, useCallback } from 'react'
import { useApi } from '../hooks/useApi.ts'
import { useWebSocket } from '../hooks/useWebSocket.ts'
import { listJobs, cancelJob, scrape } from '../lib/api.ts'
import JobCard from '../components/JobCard.tsx'
import { Plus, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import type { Job, WsMessage } from '../lib/api.ts'

const STATUS_FILTERS = ['all', 'queued', 'running', 'done', 'failed'] as const

export default function Jobs() {
  const [filter, setFilter] = useState<string>('all')
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [showScrape, setShowScrape] = useState(false)

  const { data, loading, refetch } = useApi(
    () => listJobs({ status: filter === 'all' ? undefined : filter, limit: 100 }),
    [filter],
    3000
  )

  const handleWsMessage = useCallback((_msg: WsMessage) => {
    void refetch()
  }, [refetch])

  const { connected } = useWebSocket('/v1/stream', handleWsMessage)

  const handleCancel = async (id: string) => {
    await cancelJob(id)
    void refetch()
  }

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scrapeUrl.trim()) return
    setScraping(true)
    try {
      await scrape({ url: scrapeUrl.trim(), priority: 'high' })
      setScrapeUrl('')
      setShowScrape(false)
      void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Scrape failed')
    } finally {
      setScraping(false)
    }
  }

  const jobs: Job[] = data?.jobs ?? []

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Jobs</h1>
          {connected
            ? <Wifi size={14} className="text-green-400" />
            : <WifiOff size={14} className="text-gray-500" />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refetch()} className="text-gray-500 hover:text-gray-300 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowScrape(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> New Scrape
          </button>
        </div>
      </div>

      {/* Quick scrape form */}
      {showScrape && (
        <form onSubmit={e => void handleScrape(e)} className="card flex gap-2">
          <input
            type="url"
            value={scrapeUrl}
            onChange={e => setScrapeUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={scraping}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {scraping ? 'Queuing…' : 'Go'}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-1.5">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-gray-800 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600 self-center">{jobs.length} jobs</span>
      </div>

      {/* Job list */}
      <div className="space-y-2">
        {jobs.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-600">
            <p>No jobs yet.</p>
            <p className="text-sm mt-1">Click "New Scrape" to create one.</p>
          </div>
        )}
        {jobs.map(job => (
          <JobCard key={job.id} job={job} onCancel={handleCancel} />
        ))}
      </div>
    </div>
  )
}
