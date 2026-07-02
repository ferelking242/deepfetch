import clsx from 'clsx'
import type { SystemHealth } from '../lib/api.ts'

function Bar({ value, max = 100, warn = 70, danger = 85 }: { value: number; max?: number; warn?: number; danger?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  const color = value >= danger ? 'bg-red-500' : value >= warn ? 'bg-yellow-500' : 'bg-cyan-500'

  return (
    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Stat({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: number }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      {bar !== undefined && <div className="mt-3"><Bar value={bar} /></div>}
    </div>
  )
}

export default function SystemStats({ data }: { data: SystemHealth }) {
  const statusColor = { ok: 'text-green-400', degraded: 'text-yellow-400', overloaded: 'text-red-400' }[data.status]
  const uptime = data.uptime_seconds < 3600
    ? `${Math.floor(data.uptime_seconds / 60)}m`
    : `${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor((data.uptime_seconds % 3600) / 60)}m`

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className={clsx('w-2 h-2 rounded-full', data.status === 'ok' ? 'bg-green-400' : 'bg-yellow-400')} />
        <span className={clsx('text-sm font-medium', statusColor)}>System {data.status}</span>
        <span className="text-xs text-gray-500 ml-auto">Uptime {uptime}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="CPU Usage" value={`${data.cpu_pct}%`} bar={data.cpu_pct} />
        <Stat
          label="RAM Usage"
          value={`${data.ram_pct}%`}
          sub={`${data.ram_used_gb.toFixed(1)} / ${data.ram_total_gb.toFixed(1)} GB`}
          bar={data.ram_pct}
        />
        <Stat
          label="Browser Pool"
          value={`${data.pool_active}/${data.pool_max}`}
          sub={`${data.pool_size} contexts alive`}
          bar={data.pool_active}
          // @ts-expect-error extra prop
          max={data.pool_max}
        />
        <Stat
          label="Job Queue"
          value={String(data.queue_depth)}
          sub={`${data.queue_running} running`}
        />
      </div>
    </div>
  )
}
