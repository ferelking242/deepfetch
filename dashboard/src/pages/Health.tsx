import { useApi } from '../hooks/useApi.ts'
import { health, platforms } from '../lib/api.ts'
import SystemStats from '../components/SystemStats.tsx'
import { RefreshCw, Globe } from 'lucide-react'
import clsx from 'clsx'

export default function Health() {
  const { data, loading, error, refetch } = useApi(health, [], 5000)
  const { data: platformData } = useApi(platforms, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">System Health</h1>
        <button onClick={() => void refetch()} className="text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data && <SystemStats data={data} />}

      {platformData && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Platform Adapters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {platformData.platforms.map(p => (
              <div key={p.name} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe size={14} className="text-cyan-400" />
                  <div>
                    <p className="text-sm font-medium capitalize">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.domains.slice(0, 2).join(', ')}</p>
                  </div>
                </div>
                {p.requiresSession && (
                  <span className="badge bg-yellow-900/40 text-yellow-400">session required</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
