import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi.ts'
import { listKeys, createKey, deleteKey } from '../lib/api.ts'
import { Key, Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react'

function ts(ms: number | null) {
  if (!ms) return 'Never'
  return new Date(ms).toLocaleDateString()
}

export default function Settings() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepfetch_api_key') ?? '')
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const { data, refetch } = useApi(listKeys, [])

  useEffect(() => {
    localStorage.setItem('deepfetch_api_key', apiKey)
  }, [apiKey])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const result = await createKey({ label: newLabel.trim() })
      setNewKey(result.key)
      setNewLabel('')
      void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Revoke this API key?')) return
    await deleteKey(id)
    void refetch()
  }

  const keys = data?.keys ?? []

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Active API Key */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Active API Key</h2>
        <div className="card">
          <p className="text-xs text-gray-500 mb-2">
            The key used by this dashboard to call the DeepFetch API. Stored in localStorage.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="df_..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono pr-10"
              />
              <button
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* New key revealed */}
      {newKey && (
        <div className="card border-cyan-800 bg-cyan-950/30">
          <p className="text-sm text-cyan-400 font-semibold mb-2">⚠️ Save this key now — it won't be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-300 bg-gray-900 px-3 py-2 rounded-lg font-mono break-all">{newKey}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(newKey); setApiKey(newKey) }}
              className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              title="Copy & use"
            >
              <Copy size={14} />
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {/* API Keys */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">API Keys</h2>
        </div>

        {/* Create form */}
        <form onSubmit={e => void handleCreate(e)} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Key label (e.g. mobile-client)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Generate
          </button>
        </form>

        <div className="space-y-2">
          {keys.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <Key size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No API keys yet.</p>
            </div>
          )}
          {keys.map(k => (
            <div key={k.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Key size={14} className="text-gray-500" />
                <div>
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-gray-500">
                    {k.rate_limit_per_minute} req/min · Created {ts(k.created_at)} · Last used {ts(k.last_used)}
                  </p>
                </div>
              </div>
              <button onClick={() => void handleDelete(k.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
