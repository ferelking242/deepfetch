import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '@/hooks/useApi'
import { useWebSocket } from '@/hooks/useWebSocket'
import { listJobs, cancelJob, scrape } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, RefreshCw, Wifi, WifiOff, X, ExternalLink, AlertCircle } from 'lucide-react'
import { cn, ago, domain, fmtDuration } from '@/lib/utils'
import type { Job, WsMessage } from '@/lib/api'

const STATUS_FILTERS = ['all', 'queued', 'running', 'done', 'failed'] as const

const STATUS_BADGE: Record<Job['status'], 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
  queued: 'warning',
  running: 'default',
  done: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
}

const PRIORITY_COLOR: Record<Job['priority'], string> = {
  high: 'text-primary',
  normal: 'text-muted-foreground',
  batch: 'text-muted-foreground/50',
}

function MobileJobCard({ job, onCancel }: { job: Job; onCancel: (id: string) => void }) {
  const { t } = useTranslation()
  const variant = STATUS_BADGE[job.status]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant={variant} className={cn('text-[10px]', job.status === 'running' && 'animate-pulse')}>
                {t(`jobs.status.${job.status}`)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">{job.platform}</Badge>
            </div>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-mono text-foreground hover:text-primary transition-colors truncate"
            >
              <span className="truncate">{domain(job.url)}</span>
              <ExternalLink size={9} className="flex-shrink-0 text-muted-foreground" />
            </a>
            {job.error && (
              <div className="flex items-center gap-1 mt-1">
                <AlertCircle size={9} className="text-destructive flex-shrink-0" />
                <span className="text-[10px] text-destructive truncate">{job.error}</span>
              </div>
            )}
          </div>
          {job.status === 'queued' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => onCancel(job.id)}
            >
              <X size={12} />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className={cn('font-medium', PRIORITY_COLOR[job.priority])}>{job.priority}</span>
          {job.started_at && job.finished_at && (
            <span>{fmtDuration(job.started_at, job.finished_at)}</span>
          )}
          <span className="ml-auto">{ago(job.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Jobs() {
  const { t } = useTranslation()
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
      toast.success('Job created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scrape failed')
    } finally {
      setScraping(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelJob(id)
      void refetch()
      toast.success('Job cancelled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed')
    }
  }

  const jobs: Job[] = data?.jobs ?? []

  const FILTER_KEYS = ['all', 'queued', 'running', 'done', 'failed'] as const

  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-base font-semibold">{t('jobs.title')}</h1>
          {data && (
            <Badge variant="secondary" className="font-mono text-xs">{data.count}</Badge>
          )}
          <span className={cn(
            'flex items-center gap-1 text-xs',
            connected ? 'text-emerald-500' : 'text-muted-foreground'
          )}>
            {connected
              ? <><Wifi size={11} /> {t('common.live')}</>
              : <><WifiOff size={11} /> {t('common.reconnecting')}</>
            }
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refetch()}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(s => !s)} className="gap-1.5">
            <Plus size={13} />
            <span className="hidden sm:inline">{t('jobs.quickScrape')}</span>
            <span className="sm:hidden">{t('jobs.scrape')}</span>
          </Button>
        </div>
      </div>

      {/* Quick scrape */}
      {showForm && (
        <Card className="animate-fade-in">
          <CardContent className="p-4">
            <form onSubmit={e => void handleScrape(e)} className="flex gap-2">
              <Input
                type="url"
                placeholder={t('jobs.placeholder')}
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={scraping || !url.trim()} size="sm" className="gap-1">
                {scraping ? <RefreshCw size={12} className="animate-spin" /> : t('jobs.scrape')}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowForm(false)}>
                <X size={13} />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        {FILTER_KEYS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0',
              filter === f
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {t(`jobs.filters.${f}`)}
          </button>
        ))}
      </div>

      {/* Mobile: cards */}
      <div className="lg:hidden space-y-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Layers size={32} className="opacity-20" />
            <p className="text-sm">{loading ? t('common.loading') : t('jobs.empty')}</p>
          </div>
        ) : (
          jobs.map(job => <MobileJobCard key={job.id} job={job} onCancel={id => void handleCancel(id)} />)
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">{t('jobs.table.status')}</TableHead>
              <TableHead>{t('jobs.table.url')}</TableHead>
              <TableHead className="w-28">{t('jobs.table.platform')}</TableHead>
              <TableHead className="w-24">{t('jobs.table.priority')}</TableHead>
              <TableHead className="w-24">{t('jobs.table.duration')}</TableHead>
              <TableHead className="w-28">{t('jobs.table.created')}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                  {loading ? t('common.loading') : t('jobs.empty')}
                </TableCell>
              </TableRow>
            ) : jobs.map(job => (
              <TableRow key={job.id}>
                <TableCell>
                  <Badge
                    variant={STATUS_BADGE[job.status]}
                    className={cn(job.status === 'running' && 'animate-pulse')}
                  >
                    {t(`jobs.status.${job.status}`)}
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
                      <span className="text-[10px] text-destructive truncate max-w-[220px]">{job.error}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">{job.platform}</Badge>
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
                      onClick={() => void handleCancel(job.id)}
                    >
                      {t('jobs.cancelJob')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
