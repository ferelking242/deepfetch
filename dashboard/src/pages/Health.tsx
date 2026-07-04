import { useApi } from '@/hooks/useApi'
import { health, platforms } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, Cpu, MemoryStick, Globe, Layers, Clock, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

function ProgressBar({ value, warn = 70, danger = 85 }: { value: number; warn?: number; danger?: number }) {
  const color = value >= danger ? 'bg-destructive' : value >= warn ? 'bg-amber-500' : 'bg-primary'
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, progress }: {
  icon: React.ElementType; label: string; value: string; sub?: string; progress?: number
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon size={13} className="text-muted-foreground/60" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {progress !== undefined && <div className="mt-3"><ProgressBar value={progress} /></div>}
      </CardContent>
    </Card>
  )
}

export default function Health() {
  const { data, loading, error, refetch } = useApi(health, [], 5000)
  const { data: pd } = useApi(platforms, [])

  const uptime = !data ? '—' : data.uptime_seconds < 3600
    ? `${Math.floor(data.uptime_seconds / 60)}m ${data.uptime_seconds % 60}s`
    : `${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor((data.uptime_seconds % 3600) / 60)}m`

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">System Health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live system metrics</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', data.status === 'ok' ? 'bg-emerald-500' : data.status === 'degraded' ? 'bg-amber-500' : 'bg-destructive')} />
              <Badge variant={data.status === 'ok' ? 'success' : data.status === 'degraded' ? 'warning' : 'destructive'}>
                {data.status}
              </Badge>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => void refetch()}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Stats grid */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Cpu} label="CPU Usage" value={`${data.cpu_pct}%`} progress={data.cpu_pct} />
          <StatCard
            icon={MemoryStick}
            label="Memory"
            value={`${data.ram_pct}%`}
            sub={`${data.ram_used_gb.toFixed(1)} / ${data.ram_total_gb.toFixed(1)} GB`}
            progress={data.ram_pct}
          />
          <StatCard
            icon={Layers}
            label="Browser Pool"
            value={`${data.pool_active} / ${data.pool_max}`}
            sub={`${data.pool_size} contexts`}
            progress={data.pool_max > 0 ? (data.pool_active / data.pool_max) * 100 : 0}
          />
          <StatCard
            icon={Server}
            label="Job Queue"
            value={String(data.queue_depth)}
            sub={`${data.queue_running} running`}
          />
        </div>
      )}

      {data && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <span>Uptime: <span className="text-foreground font-medium">{uptime}</span></span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <span>Pool max: <span className="text-foreground font-medium">{data.pool_max}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform adapters */}
      {pd && pd.platforms.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Platform Adapters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {pd.platforms.map(p => (
              <Card key={p.name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Globe size={13} className="text-primary" />
                      <div>
                        <p className="text-sm font-medium capitalize">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.domains.slice(0, 2).join(', ')}</p>
                      </div>
                    </div>
                    {p.requiresSession && <Badge variant="warning">auth required</Badge>}
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
