import clsx from 'clsx'
import { Clock, CheckCircle, XCircle, Loader, Ban, ExternalLink } from 'lucide-react'
import type { Job } from '../lib/api.ts'

const STATUS_CONFIG = {
  queued:    { icon: Clock,       color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Queued' },
  running:   { icon: Loader,      color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   label: 'Running' },
  done:      { icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-400/10',  label: 'Done' },
  failed:    { icon: XCircle,     color: 'text-red-400',    bg: 'bg-red-400/10',    label: 'Failed' },
  cancelled: { icon: Ban,         color: 'text-gray-400',   bg: 'bg-gray-400/10',   label: 'Cancelled' },
}

function ago(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function domain(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export default function JobCard({ job, onCancel }: { job: Job; onCancel?: (id: string) => void }) {
  const cfg = STATUS_CONFIG[job.status]
  const Icon = cfg.icon
  const duration = job.started_at && job.finished_at
    ? `${((job.finished_at - job.started_at) / 1000).toFixed(1)}s`
    : null

  return (
    <div className="card hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Status icon */}
        <div className={clsx('mt-0.5 rounded-lg p-1.5 flex-shrink-0', cfg.bg)}>
          <Icon size={14} className={clsx(cfg.color, job.status === 'running' && 'animate-spin')} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('badge', cfg.bg, cfg.color)}>{cfg.label}</span>
            <span className="badge bg-gray-800 text-gray-400">{job.platform}</span>
            <span className="badge bg-gray-800 text-gray-500">{job.priority}</span>
            {job.retries > 0 && (
              <span className="badge bg-orange-900/40 text-orange-400">retry #{job.retries}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-300 hover:text-cyan-400 truncate max-w-xs transition-colors"
            >
              {domain(job.url)}
            </a>
            <ExternalLink size={11} className="text-gray-600 flex-shrink-0" />
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>{ago(job.created_at)}</span>
            {duration && <span>· {duration}</span>}
            {job.result?.extracted_by && <span>· via {job.result.extracted_by}</span>}
          </div>

          {job.error && (
            <p className="mt-2 text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded-md truncate">
              {job.error}
            </p>
          )}
        </div>

        {/* Actions */}
        {job.status === 'queued' && onCancel && (
          <button
            onClick={() => onCancel(job.id)}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
