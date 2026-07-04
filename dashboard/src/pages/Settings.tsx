import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '@/hooks/useApi'
import { listKeys, createKey, deleteKey, whoami } from '@/lib/api'
import { toast } from 'sonner'
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

const SCOPE_META: Record<Scope, { color: string; desc: string }> = {
  '*':    { color: 'bg-violet-500/15 text-violet-400 border-violet-500/20', desc: 'Full access' },
  scrape: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',       desc: 'Scrape & batch' },
  crawl:  { color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',       desc: 'Crawl endpoints' },
  read:   { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', desc: 'Read-only' },
  admin:  { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20',    desc: 'Key management' },
}

function ScopeBadge({ scope }: { scope: Scope }) {
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border', SCOPE_META[scope].color)}>
      {scope}
    </span>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size="sm" onClick={copy}
      className={cn('gap-1 transition-colors h-7 text-xs', copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground')}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label ?? (copied ? t('common.copied') : t('common.copy'))}
    </Button>
  )
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal size={11} />
          <span className="truncate">{label}</span>
        </div>
        <CopyButton text={content} />
      </div>
      <pre className="p-4 text-xs text-foreground font-mono overflow-auto max-h-48 leading-relaxed bg-background/50 whitespace-pre-wrap break-all">{content}</pre>
    </div>
  )
}

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  const { t } = useTranslation()
  const ALL_SCOPES: Scope[] = ['*', 'scrape', 'crawl', 'read', 'admin']
  const toggle = (s: Scope) => {
    if (s === '*') { onChange(['*']); return }
    const next = value.includes('*') ? [s] : value.includes(s) ? value.filter(x => x !== s) : [...value, s]
    onChange(next.length ? next : ['read'])
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{t('settings.scopes')}</label>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SCOPES.map(s => (
          <button
            key={s}
            type="button"
            title={SCOPE_META[s].desc}
            onClick={() => toggle(s)}
            className={cn(
              'px-2 py-1 rounded text-[11px] font-mono border transition-all',
              value.includes(s)
                ? SCOPE_META[s].color + ' opacity-100'
                : 'border-border text-muted-foreground opacity-50 hover:opacity-80'
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function NewKeyCard({ created, onDismiss, onUse }: { created: CreatedKey; onDismiss: () => void; onUse: (k: string) => void }) {
  const { t } = useTranslation()
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5 animate-fade-in">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">{t('settings.keySaved')}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t('settings.keySavedHint')}</p>
          </div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/60 p-3 font-mono text-xs break-all">
          {created.key}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {created.scopes.map(s => <ScopeBadge key={s} scope={s} />)}
          <span className="text-[10px] text-muted-foreground ml-1">{created.rate_limit_per_minute} req/min</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={created.key} label={t('common.copy')} />
          <Button size="sm" onClick={() => { void navigator.clipboard.writeText(created.key); onUse(created.key) }} className="gap-1">
            <Check size={11} />
            {t('settings.useAsActive')}
          </Button>
          <button onClick={onDismiss} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t('common.dismiss')}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const { t } = useTranslation()
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
      setNewLabel(''); setScopes(['*']); setRateLimit(60); setExpiryDays('')
      setShowForm(false)
      void refetch()
      toast.success('API key generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string, label: string) => {
    try {
      await deleteKey(id)
      void refetch()
      toast.success(`Key "${label}" revoked`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
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
    <div className="p-4 sm:p-6 space-y-8 max-w-3xl animate-fade-in">
      <div>
        <h1 className="text-base font-semibold">{t('settings.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Active key */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t('settings.activeKey')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.activeKeyDesc')}</p>
          </div>
          {me && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {me.type === 'master'
                ? <ShieldCheck size={12} className="text-violet-400" />
                : <ShieldAlert size={12} className="text-blue-400" />}
              <span>{me.type === 'master' ? t('settings.masterKey') : me.label}</span>
            </div>
          )}
        </div>

        {apiKey && (
          <Card className={cn('border', apiKey.startsWith('dfk_master_') ? 'border-violet-500/30 bg-violet-500/5' : 'border-border')}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', apiKey.startsWith('dfk_master_') ? 'bg-violet-500/20' : 'bg-muted')}>
                  {apiKey.startsWith('dfk_master_')
                    ? <ShieldCheck size={14} className="text-violet-400" />
                    : <Key size={14} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">
                      {apiKey.startsWith('dfk_master_') ? t('settings.masterKeyActive') : t('settings.apiKeyActive')}
                    </span>
                    {apiKey.startsWith('dfk_master_') && <ScopeBadge scope="*" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-muted-foreground truncate">
                      {showKeyInput ? apiKey : apiKey.slice(0, 18) + '••••••••••••••••••••••••••'}
                    </code>
                    <button type="button" onClick={() => setShowKeyInput(s => !s)}
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                      {showKeyInput ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <CopyButton text={apiKey} label={t('common.copy')} />
                  </div>
                  {apiKey.startsWith('dfk_master_') && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Info size={9} />
                      {t('settings.masterKeyInfo')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Input
              type={showKeyInput ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={t('settings.pasteKey')}
              className="font-mono pr-10 text-xs"
            />
            <button type="button" onClick={() => setShowKeyInput(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showKeyInput ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          {apiKey && (
            <Button variant="ghost" size="sm" onClick={() => setApiKey('')} className="text-muted-foreground">
              {t('settings.clear')}
            </Button>
          )}
        </div>
      </div>

      {created && (
        <NewKeyCard
          created={created}
          onDismiss={() => setCreated(null)}
          onUse={k => { setApiKey(k); setCreated(null) }}
        />
      )}

      <Separator />

      {/* API Keys */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t('settings.apiKeys')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.apiKeysDesc')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(f => !f)} className="gap-1 flex-shrink-0">
            <Plus size={12} /> {t('settings.newKey')}
          </Button>
        </div>

        {showForm && (
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t('settings.generateKey')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.keySavedHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={e => void handleCreate(e)} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('settings.label')}</label>
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder={t('settings.labelPlaceholder')}
                    className="text-sm"
                    autoFocus
                    required
                  />
                </div>
                <ScopePicker value={scopes} onChange={setScopes} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('settings.rateLimit')}</label>
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
                    <label className="text-xs text-muted-foreground">{t('settings.expiresIn')}</label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={expiryDays}
                      onChange={e => setExpiryDays(e.target.value ? Number(e.target.value) : '')}
                      placeholder={t('settings.never')}
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={creating || !newLabel.trim()} className="gap-1">
                    {creating ? t('settings.generating') : <><Plus size={12} /> {t('settings.generateKey')}</>}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          {keys.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
              <Key size={24} className="opacity-20" />
              <p className="text-sm">{t('settings.noKeys')}</p>
              <p className="text-xs opacity-60 text-center max-w-xs">{t('settings.noKeysHint')}</p>
            </CardContent>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="lg:hidden divide-y divide-border">
                {keys.map(k => (
                  <div key={k.id} className={cn('p-4 space-y-2', k.expired && 'opacity-40')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{k.label}</span>
                        {k.expired && <Badge variant="outline" className="text-[9px] px-1 flex-shrink-0">{t('settings.expired')}</Badge>}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => void handleRevoke(k.id, k.label)}
                      >
                        <Trash2 size={11} />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(k.scopes ?? ['*']).map(s => <ScopeBadge key={s} scope={s as Scope} />)}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{k.rate_limit_per_minute}/min</span>
                      <span>{fmtDate(k.created_at)}</span>
                      <span>{k.last_used ? ago(k.last_used) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <Table className="hidden lg:table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('settings.table.label')}</TableHead>
                    <TableHead>{t('settings.table.scopes')}</TableHead>
                    <TableHead className="w-24">{t('settings.table.rate')}</TableHead>
                    <TableHead className="w-28">{t('settings.table.created')}</TableHead>
                    <TableHead className="w-28">{t('settings.table.lastUsed')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map(k => (
                    <TableRow key={k.id} className={k.expired ? 'opacity-40' : ''}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{k.label}</span>
                          {k.expired && <Badge variant="outline" className="text-[9px] px-1">{t('settings.expired')}</Badge>}
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
                          onClick={() => void handleRevoke(k.id, k.label)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Card>
      </div>

      <Separator />

      {/* MCP */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">{t('settings.mcp')}</h2>
            <Badge variant="default">Claude · Cursor · Cline</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.mcpDesc')}</p>
        </div>
        <CodeBlock label={t('settings.envVars')} content={envBlock} />
        <CodeBlock label="claude_desktop_config.json · .cursor/mcp.json" content={mcpJson} />
        <a
          href="https://github.com/ferelking242/deepfetch#mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink size={11} /> {t('settings.mcpDocs')}
        </a>
      </div>
    </div>
  )
}
