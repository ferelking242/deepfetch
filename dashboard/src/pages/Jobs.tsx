import { useState, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import { useWebSocket } from '@/hooks/useWebSocket'
import { listJobs, cancelJob, scrape } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, RefreshCw, Wifi, WifiOff, X, ExternalLink, AlertCircle } from 'lucide-react'
import { cn, ago, domain, fmtDuration } from '@/lib/utils'
import type { Job, WsMessage } from '@/lib/api'

const STATUS_FILTERS = ['all', 'queued', 'running', 'done', 'failed'] as const

const STATUS_BADGE: Record<Job['status'], { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary'; label: string }> = {
  queued:    { variant: 'warning',     label: 'Queued' },
  running:   { variant: 'default',     label: 'Running' },
  done:      { variant: 'success',     label: 'Done' },
  failed:    { variant: 'destructive', label: 'Failed' },
  cancelled: { variant: 'secondary',   label: 'Cancelled' },
}

const PRIORITY_COLOR: Record<Job['priority'], string> = {
  high:   'text-primary',
  normal: 'text-muted-foreground',
  batch:  'text-muted-foreground/60',
}

export default function Jobs() {
  const [filter, setFilter] = useState<string>('all')
  const [url, setUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const { data, loading, refetch } = useApi(
    () => listJobs({ status: filter === 'all' ? undefined : filter, limit: 200 }),
    [filter],
    4000
  )

  const onWs = useCallback((_msg: WsMessage) => { void refetch() }, [refetch])
  const { connected } = useWebSocket('/v1/stream', onWs)

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setScraping(true)
    try {
      await scrape({ url: url.trim(), priority: 'high' })
      setUrl('')
      setShowForm(false)
      void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Scrape failed')
    } finally {
      setScraping(false)
    }
  }

  const jobs: Job[] = data?.jobs ?? []

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold">Jobs</h1>
          {data && (
            <Badge variant="secondary" className="font-mono">{data.count}</Badge>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {connected
              ? <><Wifi size={11} className="text-emerald-500" /> live</>
              : <><WifiOff size={11} /> reconnecting</>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void refetch()}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(s => !s)}>
            <Plus size={13} /> Quick scrape
          </Button>
        </div>
      </div>

      {/* Quick scrape form */}
      {showForm && (
        <Card className="animate-fade-in">
          <CardContent className="p-4">
            <form onSubmit={e => void handleScrape(e)} className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={scraping || !url.trim()} size="sm">
                {scraping ? <RefreshCw size={12} className="animate-spin" /> : 'Scrape'}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X size={13} />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
              filter === f
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="w-24">Status</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-24">Platform</TableHead>
              <TableHead className="w-20">Priority</TableHead>
              <TableHead className="w-24">Duration</TableHead>
              <TableHead className="w-24">Created</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {loading ? 'Loading…' : 'No jobs found'}
                </TableCell>
              </TableRow>
            )}
            {jobs.map(job => {
              const s = STATUS_BADGE[job.status]
              return (
                <TableRow key={job.id}>
                  <TableCell>
                    <Badge variant={s.variant} className={cn(job.status === 'running' && 'animate-pulse')}>
                      {s.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-foreground hover:text-primary truncate max-w-[240px] block transition-colors"
                      >
                        {domain(job.url)}
                      </a>
                      <ExternalLink size={10} className="text-muted-foreground flex-shrink-0" />
                    </div>
                    {job.error && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle size={10} className="text-destructive" />
                        <span className="text-xs text-destructive truncate max-w-[220px]">{job.error}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{job.platform}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={cn('text-xs font-medium', PRIORITY_COLOR[job.priority])}>{job.priority}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {job.started_at && job.finished_at ? fmtDuration(job.started_at, job.finished_at) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ago(job.created_at)}</TableCell>
                  <TableCell>
                    {job.status === 'queued' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => { void cancelJob(job.id).then(() => void refetch()) }}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
