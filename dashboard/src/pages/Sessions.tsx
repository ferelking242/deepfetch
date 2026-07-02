import { useState } from 'react'
import { useApi } from '../hooks/useApi.ts'
import { listSessions, deleteSession, checkSession, createSessionCredentials } from '../lib/api.ts'
import { Shield, ShieldCheck, ShieldX, RefreshCw, Trash2, Plus } from 'lucide-react'
import clsx from 'clsx'

const STATUS_ICONS = {
  active:  { icon: ShieldCheck, color: 'text-green-400' },
  expired: { icon: ShieldX,     color: 'text-yellow-400' },
  invalid: { icon: ShieldX,     color: 'text-red-400' },
}

export default function Sessions() {
  const { data, loading, refetch } = useApi(listSessions, [], 10000)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ platform: 'instagram', username: '', password: '', label: '' })
  const [submitting, setSubmitting] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const sessions = data?.sessions ?? []

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return
    await deleteSession(id)
    void refetch()
  }

  const handleCheck = async (id: string) => {
    setCheckingId(id)
    try {
      const result = await checkSession(id)
      alert(`Session ${result.valid ? '✅ valid' : '❌ expired / invalid'}`)
      void refetch()
    } finally {
      setCheckingId(null)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createSessionCredentials({
        type: 'credentials',
        platform: form.platform,
        username: form.username,
        password: form.password,
        label: form.label || undefined,
      })
      setForm({ platform: 'instagram', username: '', password: '', label: '' })
      setShowAdd(false)
      void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <div className="flex gap-2">
          <button onClick={() => void refetch()} className="text-gray-500 hover:text-gray-300 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Add Session
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={e => void handleAdd(e)} className="card space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Login with credentials</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              >
                {['instagram', 'tiktok', 'reddit', 'twitter', 'facebook'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Label (optional)</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="my-account"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Username</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {submitting ? 'Logging in…' : 'Login & Save Session'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {sessions.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-600">
            <Shield size={32} className="mx-auto mb-3 opacity-30" />
            <p>No sessions yet.</p>
            <p className="text-sm mt-1">Add a session to scrape authenticated content.</p>
          </div>
        )}
        {sessions.map(s => {
          const cfg = STATUS_ICONS[s.status]
          const Icon = cfg.icon
          return (
            <div key={s.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Icon size={18} className={cfg.color} />
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-gray-500">
                    {s.platform} · {s.cookie_count} cookies
                    {s.has_credentials && ' · credentials saved'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('badge text-xs', {
                  'bg-green-900/40 text-green-400': s.status === 'active',
                  'bg-yellow-900/40 text-yellow-400': s.status === 'expired',
                  'bg-red-900/40 text-red-400': s.status === 'invalid',
                })}>{s.status}</span>
                <button
                  onClick={() => void handleCheck(s.id)}
                  disabled={checkingId === s.id}
                  className="text-xs text-gray-500 hover:text-cyan-400 transition-colors"
                >
                  {checkingId === s.id ? 'Checking…' : 'Check'}
                </button>
                <button onClick={() => void handleDelete(s.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
