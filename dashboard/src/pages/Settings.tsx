import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/useApi'
import { listKeys, createKey, deleteKey, whoami } from '@/lib/api'
import type { Scope, CreatedKey } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Key, Copy, Trash2, Plus, Eye, EyeOff, Check, Terminal,
  ExternalLink, AlertCircle, ShieldCheck, ShieldAlert, Info,
} from 'lucide-react'
import { cn, fmtDate, ago } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size="sm" onClick={copy}
      className={cn('gap-1 transition-colors', copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground')}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label ?? (copied ? 'Copied' : 'Copy')}
    </Button>
  )
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal size={11} />
          <span>{label}</span>
        </div>
        <CopyButton text={content} />
      </div>
      <pre className="p-4 text-xs text-foreground font-mono overflow-auto max-h-56 leading-relaxed bg-background/50 whitespace-pre-wrap break-all">{content}</pre>
    </div>
  )
}

// Scope meta — badge colour + description
const SCOPE_META: Record<Scope, { color: string; desc: string }> = {
  '*':      { color: 'bg-violet-500/15 text-violet-400 border-violet-500/20', desc: 'Full access — all endpoints' },
  scrape:   { color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',       desc: 'Scrape & batch endpoints' },
  crawl:    { color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',       desc: 'Crawl endpoints' },
  read:     { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', desc: 'Read-only (jobs, sessions, health)' },
  admin:    { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20',    desc: 'Key management + settings' },
}

function ScopeBadge({ scope }: { scope: Scope }) {
  const meta = SCOPE_META[scope]
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border', meta.color)}>
      {scope}
    </span>
  )
}

// ── Master Key Banner ─────────────────────────────────────────────────────────

function MasterKeyBanner({ apiKey }: { apiKey: string }) {
  const isMaster = apiKey.startsWith('dfk_master_')
  const [show, setShow] = useState(false)

  if (!apiKey) return null

  return (
    <Card className={cn(
      'border',
      isMaster ? 'border-violet-500/30 bg-violet-500/5' : 'border-border',
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
            isMaster ? 'bg-violet-500/20' : 'bg-muted',
          )}>
            {isMaster ? <ShieldCheck size={14} className="text-violet-400" /> : <Key size={14} className="text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">
                {isMaster ? 'Master Key active' : 'API Key active'}
              </span>
              {isMaster && <ScopeBadge scope="*" />}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-muted-foreground truncate">
                {show ? apiKey : apiKey.slice(0, 14) + '••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </code>
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title={show ? 'Hide key' : 'Reveal key'}
              >
                {show ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <CopyButton text={apiKey} label="Copy" />
            </div>
            {isMaster && (
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info size={9} />
                Master key — unlimited rate, all scopes, never expires. Generate dedicated keys for agents.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Scope Picker ──────────────────────────────────────────────────────────────

const ALL_SCOPES: Scope[] = ['*', 'scrape', 'crawl', 'read', 'admin']

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  const toggle = (s: Scope) => {
    if (s === '*') { onChange(['*']); return }
    const next = value.includes('*') ? [s] : value.includes(s) ? value.filter(x => x !== s) : [...value, s]
    onChange(next.length ? next : ['read'])
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">Scopes</label>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SCOPES.map(s => {
          const active = value.includes(s)
          const meta = SCOPE_META[s]
          return (
            <button
              key={s}
              type="button"
              title={meta.desc}
              onClick={() => toggle(s)}
              className={cn(
                'px-2 py-1 rounded text-[11px] font-mono border transition-all',
                active ? meta.color + ' opacity-100' : 'border-border text-muted-foreground opacity-60 hover:opacity-90',
              )}
            >
              {s}
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {value.includes('*') ? 'Full access — equivalent to master key' : value.map(s => SCOPE_META[s]?.desc).join(' · ')}
      </p>
    </div>
  )
}

// ── New Key Revealed Card ─────────────────────────────────────────────────────

function NewKeyCard({ created, onDismiss, onUse }: { created: CreatedKey; onDismiss: () => void; onUse: (k: string) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(created.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5 animate-fade-in">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Key generated — save it now</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">This is the only time you'll see the full key. It is stored as a one-way hash.</p>
          </div>
        </div>

        <div className="rounded-md border border-emerald-500/20 bg-background/60 p-3 font-mono text-xs break-all text-foreground">
          {created.key}
        </div>

        <div className="flex flex-wrap gap-1">
          {created.scopes.map(s => <ScopeBadge key={s} scope={s} />)}
          <span className="text-[10px] text-muted-foreground ml-1 self-center">{created.rate_limit_per_minute} req/min</span>
          {created.expires_at && (
            <span className="text-[10px] text-amber-400 self-center">expires {fmtDate(created.expires_at)}</span>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy} className={cn('gap-1', copied && 'text-emerald-400')}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button size="sm" onClick={() => { copy(); onUse(created.key) }} className="gap-1">
            <Check size={11} />
            Use as active key
          </Button>
          <button onClick={onDismiss} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
            Dismiss
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepfetch_api_key') ?? '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['*'])
  const [rateLimit, setRateLimit] = useState(60)
  const [expiryDays, setExpiryDays] = useState<number | ''>('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [showForm, setShowForm] = useState(false)
  const { data, refetch } = useApi(listKeys, [])
  const { data: me } = useApi(whoami, [apiKey])

  useEffect(() => { localStorage.setItem('deepfetch_api_key', apiKey) }, [apiKey])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const result = await createKey({
        label: newLabel.trim(),
        scopes,
        rate_limit_per_minute: rateLimit,
        expires_in_days: expiryDays !== '' ? expiryDays : undefined,
      })
      setCreated(result)
      setNewLabel('')
      setScopes(['*'])
      setRateLimit(60)
      setExpiryDays('')
      setShowForm(false)
      void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  const keys = data?.keys ?? []
  const origin = window.location.origin
  const effectiveKey = apiKey || '<your-api-key>'
  const envBlock = `DEEPFETCH_URL=${origin}\nDEEPFETCH_API_KEY=${effectiveKey}`
  const mcpJson = JSON.stringify({
    mcpServers: {
      deepfetch: {
        command: 'node',
        args: ['/path/to/deepfetch/mcp/server.js'],
        env: { DEEPFETCH_URL: origin, DEEPFETCH_API_KEY: effectiveKey },
      },
    },
  }, null, 2)

  return (
    <div className="p-6 space-y-8 max-w-3xl animate-fade-in">
      <div>
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">API keys, scopes, and integrations</p>
      </div>

      {/* ── Active key ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Active Key</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Used by this dashboard for all requests. Saved in localStorage.</p>
          </div>
          {me && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {me.type === 'master'
                ? <ShieldCheck size={12} className="text-violet-400" />
                : <ShieldAlert size={12} className="text-blue-400" />}
              <span>{me.type === 'master' ? 'Master key' : me.label}</span>
            </div>
          )}
        </div>

        <MasterKeyBanner apiKey={apiKey} />

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Input
              type={showKeyInput ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste a key — dfk_master_… or dfk_…"
              className="font-mono pr-10 text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKeyInput(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKeyInput ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          {apiKey && (
            <Button variant="ghost" size="sm" onClick={() => setApiKey('')} className="text-muted-foreground">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Newly generated key ── */}
      {created && (
        <NewKeyCard
          created={created}
          onDismiss={() => setCreated(null)}
          onUse={(k) => { setApiKey(k); setCreated(null) }}
        />
      )}

      <Separator />

      {/* ── API Keys table ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">API Keys</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Dedicated keys for agents, CI, and external tools. Each key has its own scopes and rate limit.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(f => !f)} className="gap-1">
            <Plus size={12} /> New key
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card className="border-border animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Generate new key</CardTitle>
              <CardDescription className="text-xs">The key will only be shown once. Store it in a secret manager.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={e => void handleCreate(e)} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Label</label>
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="claude-agent, github-ci, n8n…"
                    className="text-sm"
                    autoFocus
                    required
                  />
                </div>

                <ScopePicker value={scopes} onChange={setScopes} />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Rate limit (req/min)</label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={rateLimit}
                      onChange={e => setRateLimit(Number(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Expires in (days) — optional</label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={expiryDays}
                      onChange={e => setExpiryDays(e.target.value ? Number(e.target.value) : '')}
                      placeholder="Never"
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={creating || !newLabel.trim()} className="gap-1">
                    {creating ? 'Generating…' : <><Plus size={12} /> Generate</>}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          {keys.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
              <Key size={24} className="opacity-20" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs opacity-60">The master key from your Colab logs has full access — generate dedicated keys for agents here.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(k => (
                  <TableRow key={k.id} className={k.expired ? 'opacity-40' : ''}>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {k.label}
                        {k.expired && <Badge variant="outline" className="text-[9px] px-1">expired</Badge>}
                        {k.expires_at && !k.expired && (
                          <span className="text-[9px] text-amber-400">exp {ago(k.expires_at)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {(k.scopes ?? ['*']).map(s => <ScopeBadge key={s} scope={s as Scope} />)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.rate_limit_per_minute}/min</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(k.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.last_used ? ago(k.last_used) : '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { if (confirm(`Revoke "${k.label}"?`)) void deleteKey(k.id).then(() => void refetch()) }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Separator />

      {/* ── MCP Connect ── */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">MCP Connect</h2>
            <Badge variant="default">Claude · Cursor · Cline</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Expose DeepFetch as native tools to any MCP-compatible agent.
            Auto-discovered:{' '}
            {['scrape_url', 'crawl_website', 'batch_scrape', 'get_job'].map(t => (
              <code key={t} className="text-[10px] bg-muted px-1 rounded mx-0.5">{t}</code>
            ))}
          </p>
        </div>
        <CodeBlock label="Environment variables" content={envBlock} />
        <CodeBlock label="claude_desktop_config.json  ·  .cursor/mcp.json" content={mcpJson} />
        <a
          href="https://github.com/ferelking242/deepfetch#mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink size={11} /> Full MCP documentation
        </a>
      </div>
    </div>
  )
}
