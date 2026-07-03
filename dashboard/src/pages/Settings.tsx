import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi.ts'
import { listKeys, createKey, deleteKey } from '../lib/api.ts'
import { Key, Copy, Trash2, Plus, Eye, EyeOff, Check, Terminal, ExternalLink } from 'lucide-react'

function ts(ms: number | null) {
  if (!ms) return 'Never'
  return new Date(ms).toLocaleDateString()
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded-md hover:bg-gray-800"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copié' : label}
    </button>
  )
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
    if (!confirm('Révoquer cette clé API ?')) return
    await deleteKey(id)
    void refetch()
  }

  const keys = data?.keys ?? []
  const origin = window.location.origin.replace('/dashboard', '')
  const mcpEnvBlock = `DEEPFETCH_URL=${origin}\nDEEPFETCH_API_KEY=${apiKey || '<your-api-key>'}`
  const mcpJsonBlock = JSON.stringify({
    mcpServers: {
      deepfetch: {
        command: 'node',
        args: ['/path/to/deepfetch/mcp/server.js'],
        env: {
          DEEPFETCH_URL: origin,
          DEEPFETCH_API_KEY: apiKey || '<your-api-key>',
        },
      },
    },
  }, null, 2)

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* ── Active API Key ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Clé API active</h2>
        <div className="card">
          <p className="text-xs text-gray-500 mb-2">
            Clé utilisée par ce dashboard pour appeler l'API DeepFetch. Stockée en localStorage.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="df_..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono pr-10 focus:outline-none focus:border-cyan-600 transition-colors"
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

      {/* ── Nouvelle clé révélée ── */}
      {newKey && (
        <div className="card border-cyan-800 bg-cyan-950/30">
          <p className="text-sm text-cyan-400 font-semibold mb-2">⚠️ Sauvegarde cette clé maintenant — elle ne sera plus affichée</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-300 bg-gray-900 px-3 py-2 rounded-lg font-mono break-all">{newKey}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(newKey); setApiKey(newKey) }}
              className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              title="Copier et utiliser"
            >
              <Copy size={14} />
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Fermer
          </button>
        </div>
      )}

      {/* ── Gestion des clés API ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Clés API</h2>
        </div>

        <form onSubmit={e => void handleCreate(e)} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (ex: agent-claude, mobile-client)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-600 transition-colors"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Générer
          </button>
        </form>

        <div className="space-y-2">
          {keys.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <Key size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune clé API.</p>
            </div>
          )}
          {keys.map(k => (
            <div key={k.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Key size={14} className="text-gray-500" />
                <div>
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-gray-500">
                    {k.rate_limit_per_minute} req/min · Créée {ts(k.created_at)} · Dernière utilisation {ts(k.last_used)}
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

      {/* ── MCP Connect ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">MCP Connect</h2>
          <span className="badge bg-cyan-900/40 text-cyan-400">Claude · Cursor · Cline</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Connecte DeepFetch à n'importe quel agent compatible MCP (Model Context Protocol).
          Les outils <code className="bg-gray-800 px-1 rounded">scrape_url</code>, <code className="bg-gray-800 px-1 rounded">crawl_website</code>, <code className="bg-gray-800 px-1 rounded">batch_scrape</code> et <code className="bg-gray-800 px-1 rounded">get_job</code> sont exposés automatiquement.
        </p>

        {/* Variables d'environnement */}
        <div className="space-y-3">
          <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Terminal size={12} className="text-gray-500" />
                <span className="text-xs text-gray-400">Variables d'environnement</span>
              </div>
              <CopyButton text={mcpEnvBlock} />
            </div>
            <pre className="p-4 text-xs text-gray-300 font-mono">{mcpEnvBlock}</pre>
          </div>

          {/* Config JSON claude_desktop / Cursor */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Terminal size={12} className="text-gray-500" />
                <span className="text-xs text-gray-400">claude_desktop_config.json · .cursor/mcp.json</span>
              </div>
              <CopyButton text={mcpJsonBlock} />
            </div>
            <pre className="p-4 text-xs text-gray-300 font-mono overflow-auto max-h-64">{mcpJsonBlock}</pre>
          </div>

          {/* Docs link */}
          <a
            href="https://github.com/ferelking242/deepfetch#mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
          >
            <ExternalLink size={11} /> Documentation MCP complète
          </a>
        </div>
      </section>
    </div>
  )
}
