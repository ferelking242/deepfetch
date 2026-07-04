import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '@/hooks/useApi'
import { health, platforms } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { RefreshCw, Cpu, MemoryStick, Globe, Layers, Clock, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemHealth } from '@/lib/api'

interface HistoryPoint {
  t: string
  cpu: number
  ram: number
}

const MAX_HISTORY = 60

function StatCard({ icon: Icon, label, value, sub, progress, warn = 70, danger = 85 }: {
  icon: React.ElementType; label: string; value: string
  sub?: string; progress?: number; warn?: number; danger?: number
}) {
  const color = progress !== undefined
    ? progress >= danger ? 'bg-destructive' : progress >= warn ? 'bg-amber-500' : 'bg-primary'
    : 'bg-primary'

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <Icon size={13} className="text-muted-foreground/50" />
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {progress !== undefined && (
          <div className="mt-3">
            <Progress
              value={progress}
              indicatorClassName={cn(
                'transition-all duration-700',
                progress >= danger ? 'bg-destructive'
                  : progress >= warn ? 'bg-amber-500'
                  : 'bg-primary'
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SparkChart({ data, dataKey, color, label }: {
  data: HistoryPoint[]
  dataKey: 'cpu' | 'ram'
  color: string
  label: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs text-muted-foreground mb-2 font-medium">{label}</p>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: -32, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
              fontSize: '11px',
              color: 'hsl(var(--foreground))',
            }}
            formatter={(v: number) => [`${v}%`, label]}
            labelFormatter={() => ''}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Health() {
  const { t } = useTranslation()
  const historyRef = useRef<HistoryPoint[]>([])

  const { data, loading, error, refetch } = useApi(health, [], 5000)
  const { data: pd } = useApi(platforms, [])

  if (data) {
    const now = new Date()
    const label = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1)),
      { t: label, cpu: Math.round(data.cpu_pct), ram: Math.round(data.ram_pct) },
    ]
  }

  const history = historyRef.current

  const fmtUptime = (s: number) =>
    s < 3600
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`

  const statusColor = {
    ok: 'text-emerald-500',
    degraded: 'text-amber-500',
    overloaded: 'text-destructive',
  }

  const statusBadge = {
    ok: 'success' as const,
    degraded: 'warning' as const,
    overloaded: 'destructive' as const,
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{t('health.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('health.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant={statusBadge[data.status]}>
              <span className={cn('h-1.5 w-1.5 rounded-full mr-1.5', statusColor[data.status])} />
              {t(`health.status.${data.status}`)}
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refetch()}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      {data && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            icon={Cpu}
            label={t('health.cpu')}
            value={`${Math.round(data.cpu_pct)}%`}
            progress={data.cpu_pct}
          />
          <StatCard
            icon={MemoryStick}
            label={t('health.ram')}
            value={`${Math.round(data.ram_pct)}%`}
            sub={`${data.ram_used_gb.toFixed(1)} / ${data.ram_total_gb.toFixed(1)} GB`}
            progress={data.ram_pct}
          />
          <StatCard
            icon={Layers}
            label={t('health.pool')}
            value={`${data.pool_active} / ${data.pool_max}`}
            sub={`${data.pool_size} ${t('health.contexts')}`}
            progress={data.pool_max > 0 ? (data.pool_active / data.pool_max) * 100 : 0}
          />
          <StatCard
            icon={Server}
            label={t('health.queue')}
            value={String(data.queue_depth)}
            sub={`${data.queue_running} ${t('health.running')}`}
          />
        </div>
      )}

      {/* Uptime */}
      {data && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <span>{t('health.uptime')}: <span className="text-foreground font-medium font-mono">{fmtUptime(data.uptime_seconds)}</span></span>
              </div>
              <div className="h-3 w-px bg-border hidden sm:block" />
              <span>{t('health.poolMax')}: <span className="text-foreground font-medium">{data.pool_max}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resource history charts */}
      {history.length > 2 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium">{t('health.history')}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="flex gap-6 flex-col sm:flex-row">
              <SparkChart
                data={history}
                dataKey="cpu"
                color="hsl(var(--primary))"
                label={`CPU% — ${history[history.length - 1]?.cpu ?? 0}%`}
              />
              <SparkChart
                data={history}
                dataKey="ram"
                color="hsl(187 60% 45%)"
                label={`RAM% — ${history[history.length - 1]?.ram ?? 0}%`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform adapters */}
      {pd && pd.platforms.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('health.platforms')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {pd.platforms.map(p => (
              <Card key={p.name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe size={13} className="text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.domains.slice(0, 2).join(', ')}
                        </p>
                      </div>
                    </div>
                    {p.requiresSession && (
                      <Badge variant="warning" className="flex-shrink-0 text-[10px]">
                        {t('health.authRequired')}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
