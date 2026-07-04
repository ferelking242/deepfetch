import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '@/hooks/useApi'
import { listKeys, createKey, deleteKey, whoami } from '@/lib/api'
import { toast } from 'sonner'
import type { Scope, CreatedKey } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Key, Copy, Trash2, Plus, Eye, EyeOff, Check, Terminal,
  ExternalLink, AlertCircle, ShieldCheck, ShieldAlert, Info,
  Sun, Moon, Monitor, ChevronRight, Globe,
} from 'lucide-react'
import { cn, fmtDate, ago } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size="sm" onClick={copy}
      className={cn('gap-1 h-7 text-xs transition-colors flex-shrink-0', copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground')}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label ?? (copied ? t('common.copied') : t('common.copy'))}
    </Button>
  )
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal size={11} />
          <span className="font-mono truncate text-[10px]">{label}</span>
        </div>
        <CopyBtn text={content} />
      </div>
      <pre className="p-4 text-xs font-mono overflow-auto max-h-52 bg-background/50 whitespace-pre-wrap break-all leading-relaxed">{content}</pre>
    </div>
  )
}

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  const { t } = useTranslation()
  const ALL: Scope[] = ['*', 'scrape', 'crawl', 'read', 'admin']
  const toggle = (s: Scope) => {
    if (s === '*') { onChange(['*']); return }
    const next = value.includes('*') ? [s] : value.includes(s) ? value.filter(x => x !== s) : [...value, s]
    onChange(next.length ? next : ['read'])
  }
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-2">{t('settings.scopes')}</label>
      <div className="flex flex-wrap gap-1.5">
        {ALL.map(s => (
          <button key={s} type="button" title={SCOPE_META[s].desc} onClick={() => toggle(s)}
            className={cn('px-2.5 py-1.5 rounded-md text-[11px] font-mono border transition-all min-h-[36px]',
              value.includes(s) ? SCOPE_META[s].color + ' opacity-100' : 'border-border text-muted-foreground opacity-50 hover:opacity-80')}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Keys Tab ───────────────────────────────────────────────────────────────────

function NewKeyBanner({ created, onDismiss, onUse }: { created: CreatedKey; onDismiss: () => void; onUse: (k: string) => void }) {
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
        <div className="rounded-md border border-emerald-500/20 bg-background/60 p-3 font-mono text-xs break-all select-all">
          {created.key}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {created.scopes.map(s => <ScopeBadge key={s} scope={s} />)}
          <span className="text-[10px] text-muted-foreground ml-1">{created.rate_limit_per_minute} req/min</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyBtn text={created.key} label={t('common.copy')} />
          <Button size="sm" className="gap-1" onClick={() => { void navigator.clipboard.writeText(created.key); onUse(created.key) }}>
            <Check size={11} /> {t('settings.useAsActive')}
          </Button>
          <button onClick={onDismiss} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            {t('common.dismiss')}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

function KeysTab() {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepfetch_api_key') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['*'])
  const [rateLimit, setRateLimit] = useState(60)
  const [expiryDays, setExpiryDays] = useState<number | ''>('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [showForm, setShowForm] = useState(false)
  const { data, refetch } = useApi(listKeys, [])
  const { data: me } = useApi(whoami, [apiKey])
  const keys = data?.keys ?? []

  useEffect(() => { localStorage.setItem('deepfetch_api_key', apiKey) }, [apiKey])

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const result = await createKey({ label: newLabel.trim(), scopes, rate_limit_per_minute: rateLimit, expires_in_days: expiryDays !== '' ? expiryDays : undefined })
      setCreated(result)
      setNewLabel(''); setScopes(['*']); setRateLimit(60); setExpiryDays('')
      setShowForm(false)
      void refetch()
      toast.success('API key generated')
    } catch (err) { toast.error(err instanceof Error ? err.message : t('common.error')) }
    finally { setCreating(false) }
  }

  const handleRevoke = async (id: string, label: string) => {
    try {
      await deleteKey(id); void refetch()
      toast.success(`Key "${label}" revoked`)
    } catch (err) { toast.error(err instanceof Error ? err.message : t('common.error')) }
  }

  return (
    <div className="space-y-6">
      {/* Active key */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t('settings.activeKey')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.activeKeyDesc')}</p>
        </div>

        {apiKey && (
          <Card className={cn('border', apiKey.startsWith('dfk_master_') ? 'border-violet-500/30 bg-violet-500/5' : '')}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', apiKey.startsWith('dfk_master_') ? 'bg-violet-500/20' : 'bg-muted')}>
                  {apiKey.startsWith('dfk_master_') ? <ShieldCheck size={14} className="text-violet-400" /> : <Key size={14} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold">{apiKey.startsWith('dfk_master_') ? t('settings.masterKeyActive') : t('settings.apiKeyActive')}</span>
                    {apiKey.startsWith('dfk_master_') && <ScopeBadge scope="*" />}
                    {me && <span className="text-[10px] text-muted-foreground">— {me.label}</span>}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="flex-1 text-[11px] font-mono text-muted-foreground truncate min-w-0">
                      {showKey ? apiKey : apiKey.slice(0, 20) + '••••••••••••'}
                    </code>
                    <button onClick={() => setShowKey(s => !s)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                      {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <CopyBtn text={apiKey} />
                  </div>
                  {apiKey.startsWith('dfk_master_') && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Info size={9} className="flex-shrink-0" /> {t('settings.masterKeyInfo')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={t('settings.pasteKey')}
              className="font-mono pr-10 text-xs h-10"
            />
            <button onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {apiKey && (
            <Button variant="ghost" size="sm" onClick={() => setApiKey('')} className="h-10 px-3">{t('settings.clear')}</Button>
          )}
        </div>
      </section>

      {created && (
        <NewKeyBanner created={created} onDismiss={() => setCreated(null)} onUse={k => { setApiKey(k); setCreated(null) }} />
      )}

      <Separator />

      {/* API Keys list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t('settings.apiKeys')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.apiKeysDesc')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(f => !f)} className="gap-1.5 flex-shrink-0 h-9">
            <Plus size={12} /> {t('settings.newKey')}
          </Button>
        </div>

        {showForm && (
          <Card className="animate-fade-in">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm">{t('settings.generateKey')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.keySavedHint')}</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form onSubmit={e => void handleCreate(e)} className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">{t('settings.label')}</label>
                  <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={t('settings.labelPlaceholder')} className="h-10" autoFocus required />
                </div>
                <ScopePicker value={scopes} onChange={setScopes} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">{t('settings.rateLimit')}</label>
                    <Input type="number" min={1} max={10000} value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))} className="h-10" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">{t('settings.expiresIn')}</label>
                    <Input type="number" min={1} max={3650} value={expiryDays} onChange={e => setExpiryDays(e.target.value ? Number(e.target.value) : '')} placeholder={t('settings.never')} className="h-10" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={creating || !newLabel.trim()} className="gap-1.5 h-9">
                    {creating ? t('settings.generating') : <><Plus size={12} /> {t('settings.generateKey')}</>}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-9">{t('common.cancel')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          {keys.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2 p-4">
              <Key size={24} className="opacity-20" />
              <p className="text-sm">{t('settings.noKeys')}</p>
              <p className="text-xs opacity-60 text-center max-w-xs">{t('settings.noKeysHint')}</p>
            </CardContent>
          ) : (
            <>
              {/* Mobile */}
              <div className="lg:hidden divide-y divide-border">
                {keys.map(k => (
                  <div key={k.id} className={cn('p-4 space-y-2', k.expired && 'opacity-40')}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">{k.label}</span>
                        {k.expired && <Badge variant="outline" className="text-[9px] px-1 flex-shrink-0">{t('settings.expired')}</Badge>}
                        {k.expires_at && !k.expired && <span className="text-[9px] text-amber-400 flex-shrink-0">exp {ago(k.expires_at)}</span>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void handleRevoke(k.id, k.label)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">{(k.scopes ?? ['*']).map(s => <ScopeBadge key={s} scope={s as Scope} />)}</div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span>{k.rate_limit_per_minute}/min</span>
                      <span>{fmtDate(k.created_at)}</span>
                      <span>{k.last_used ? ago(k.last_used) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop */}
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
                          {k.label}
                          {k.expired && <Badge variant="outline" className="text-[9px] px-1">{t('settings.expired')}</Badge>}
                          {k.expires_at && !k.expired && <span className="text-[9px] text-amber-400">exp {ago(k.expires_at)}</span>}
                        </div>
                      </TableCell>
                      <TableCell><div className="flex flex-wrap gap-0.5">{(k.scopes ?? ['*']).map(s => <ScopeBadge key={s} scope={s as Scope} />)}</div></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{k.rate_limit_per_minute}/min</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(k.created_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{k.last_used ? ago(k.last_used) : '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void handleRevoke(k.id, k.label)}>
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
      </section>

      <Separator />

      {/* MCP */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">{t('settings.mcp')}</h2>
            <Badge variant="default">Claude · Cursor · Cline</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.mcpDesc')}</p>
        </div>
        <CodeBlock label={t('settings.envVars')} content={envBlock} />
        <CodeBlock label="claude_desktop_config.json · .cursor/mcp.json" content={mcpJson} />
        <a href="https://github.com/ferelking242/deepfetch#mcp" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
          <ExternalLink size={11} /> {t('settings.mcpDocs')}
        </a>
      </section>
    </div>
  )
}

// ── Appearance Tab ─────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
]

function AppearanceTab() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  const themes = [
    { value: 'system', Icon: Monitor, label: t('settings.appearance.themeSystem'), desc: t('settings.appearance.themeSystemDesc') },
    { value: 'dark',   Icon: Moon,    label: t('settings.appearance.themeDark'),   desc: t('settings.appearance.themeDarkDesc') },
    { value: 'light',  Icon: Sun,     label: t('settings.appearance.themeLight'),  desc: t('settings.appearance.themeLightDesc') },
  ] as const

  const changeLang = (code: string) => {
    void i18n.changeLanguage(code)
    localStorage.setItem('df-lang', code)
  }

  return (
    <div className="space-y-8">
      {/* Theme */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{t('settings.appearance.theme')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.appearance.themeDesc')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themes.map(({ value, Icon, label, desc }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all min-h-[72px]',
                theme === value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-border/80 hover:bg-accent/30'
              )}
            >
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', theme === value ? 'bg-primary/15' : 'bg-muted')}>
                <Icon size={18} className={theme === value ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', theme === value && 'text-primary')}>{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
              </div>
              {theme === value && <Check size={16} className="text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      {/* Language */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{t('settings.appearance.language')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.appearance.languageDesc')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {LANGUAGES.map(({ code, flag, name }) => {
            const active = i18n.language === code
            return (
              <button
                key={code}
                onClick={() => changeLang(code)}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all min-h-[72px]',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-border/80 hover:bg-accent/30'
                )}
              >
                <span className="text-3xl leading-none flex-shrink-0">{flag}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-semibold', active && 'text-primary')}>{name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{code.toUpperCase()}</p>
                </div>
                {active && <Check size={16} className="text-primary flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ── Docs Tab ───────────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: 'GET' | 'POST' | 'DELETE' | 'WS' }) {
  const colors = {
    GET:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    POST:   'bg-blue-500/15 text-blue-400 border-blue-500/20',
    DELETE: 'bg-red-500/15 text-red-400 border-red-500/20',
    WS:     'bg-violet-500/15 text-violet-400 border-violet-500/20',
  }
  return <span className={cn('text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border', colors[method])}>{method}</span>
}

function Param({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
  return (
    <div className="flex gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex-shrink-0 min-w-[120px]">
        <code className="text-[11px] font-mono text-foreground">{name}</code>
        <span className={cn('text-[9px] ml-1.5 px-1 py-0.5 rounded', required ? 'bg-amber-500/15 text-amber-400' : 'bg-muted text-muted-foreground')}>
          {required ? 'required' : 'optional'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono text-primary/70">{type}</span>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-4 pb-8 border-b border-border last:border-0">
      {children}
    </section>
  )
}

function SectionTitle({ method, path, desc }: { method?: 'GET' | 'POST' | 'DELETE' | 'WS'; path: string; desc?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {method && <MethodBadge method={method} />}
        <code className="text-sm font-mono font-semibold text-foreground">{path}</code>
      </div>
      {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
    </div>
  )
}

function DocsTab() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const KEY = 'dfk_master_xxxxxxxxxxxx'

  const curl = (method: string, path: string, body?: string) =>
    `curl -X ${method} ${origin}${path} \\\n  -H "Authorization: Bearer ${KEY}"` +
    (body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'` : '')

  return (
    <div className="space-y-8 text-sm">

      {/* Overview */}
      <Section id="overview">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-primary" /> Overview</h3>
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>All endpoints are prefixed with <code className="text-foreground font-mono">/v1</code>. Responses are JSON.</p>
          <p>Base URL: <code className="text-foreground font-mono">{origin}</code></p>
        </div>
        <CodeBlock label="Base URL" content={origin + '/v1'} />
      </Section>

      {/* Auth */}
      <Section id="auth">
        <h3 className="text-sm font-semibold">Authentication</h3>
        <p className="text-xs text-muted-foreground">Pass your API key or master key in the <code className="text-foreground">Authorization</code> header.</p>
        <CodeBlock label="Authorization header" content={`Authorization: Bearer ${KEY}`} />
        <div className="rounded-lg border border-border p-3 text-xs space-y-1">
          <Param name="dfk_master_…" type="string" required desc="Master key — unlimited, all scopes, never expires. Shown once in Colab logs." />
          <Param name="dfk_…" type="string" required desc="API key — scoped, rate-limited. Generate via Settings → API Keys." />
        </div>
      </Section>

      {/* Scrape */}
      <Section id="scrape">
        <SectionTitle method="POST" path="/v1/scrape" desc="Extract content, metadata, or screenshots from any URL." />
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs">
          <Param name="url" type="string" required desc="Target URL to scrape." />
          <Param name="output" type="string[]" desc="Formats: markdown, json, html, screenshot. Default: [markdown, json]." />
          <Param name="sync" type="boolean" desc="Wait for result (true) or return job_id immediately (false). Default: true." />
          <Param name="priority" type="high | normal | batch" desc="Job priority. Default: high." />
          <Param name="session_id" type="string" desc="ID of an authenticated session (for Instagram, TikTok, Reddit, etc.)." />
          <Param name="options.scroll" type="boolean" desc="Auto-scroll the page before capturing." />
          <Param name="options.wait_for" type="string" desc="CSS selector to wait for before scraping." />
          <Param name="options.timeout_ms" type="number" desc="Navigation timeout in ms. Default: 30000." />
          <Param name="options.max_comments" type="number" desc="Max comments to extract (Facebook, Reddit). Default: 50." />
          <Param name="options.actions" type="BrowserAction[]" desc="Sequence of browser actions: fill, click, wait_for_selector, select." />
        </div>
        <CodeBlock label="cURL example" content={curl('POST', '/v1/scrape', '{"url":"https://example.com","output":["markdown","json"],"sync":true}')} />
        <CodeBlock label="Response" content={JSON.stringify({ job_id: 'j_abc123', status: 'done', platform: 'generic', result: { markdown: '# Title\n\nContent…', json: {} }, duration_ms: 1234 }, null, 2)} />
      </Section>

      {/* Crawl */}
      <Section id="crawl">
        <SectionTitle method="POST" path="/v1/crawl" desc="Follow links from a seed URL and scrape multiple pages." />
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs">
          <Param name="url" type="string" required desc="Seed URL to start crawling from." />
          <Param name="depth" type="number" desc="Max link depth from seed. Default: 2." />
          <Param name="limit" type="number" desc="Max pages to scrape. Default: 20." />
          <Param name="same_domain" type="boolean" desc="Stay on the same domain. Default: true." />
          <Param name="exclude_patterns" type="string[]" desc="URL patterns to skip (e.g. /login, /admin)." />
          <Param name="output" type="string[]" desc="Output formats per page. Default: [markdown]." />
          <Param name="priority" type="high | normal | batch" desc="Job priority. Default: normal." />
        </div>
        <CodeBlock label="cURL example" content={curl('POST', '/v1/crawl', '{"url":"https://docs.example.com","depth":2,"limit":50}')} />
        <CodeBlock label="Response" content={JSON.stringify({ job_id: 'j_crawl123', seed_url: 'https://docs.example.com', config: { depth: 2, limit: 50 }, message: 'Crawl queued' }, null, 2)} />
      </Section>

      {/* Batch */}
      <Section id="batch">
        <SectionTitle method="POST" path="/v1/batch" desc="Scrape multiple URLs in parallel." />
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs">
          <Param name="urls" type="string[]" required desc="List of URLs to scrape." />
          <Param name="output" type="string[]" desc="Output formats. Default: [markdown]." />
          <Param name="priority" type="high | normal | batch" desc="Job priority. Default: batch." />
          <Param name="session_id" type="string" desc="Shared session ID for all URLs." />
          <Param name="options" type="object" desc="Same as scrape options (scroll, timeout_ms, max_comments)." />
        </div>
        <CodeBlock label="cURL example" content={curl('POST', '/v1/batch', '{"urls":["https://a.com","https://b.com"],"output":["markdown","json"]}')} />
        <CodeBlock label="Response" content={JSON.stringify({ job_ids: ['j_1', 'j_2'], count: 2, message: '2 jobs queued' }, null, 2)} />
      </Section>

      {/* Jobs */}
      <Section id="jobs">
        <h3 className="text-sm font-semibold">Jobs</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <SectionTitle method="GET" path="/v1/jobs" desc="List jobs with optional status filter." />
            <CodeBlock label="cURL" content={curl('GET', '/v1/jobs?status=running&limit=50')} />
          </div>
          <div className="space-y-2">
            <SectionTitle method="GET" path="/v1/jobs/:id" desc="Get a single job by ID (includes full result when done)." />
            <CodeBlock label="Job object" content={JSON.stringify({
              id: 'j_abc123', url: 'https://example.com', platform: 'generic',
              status: 'done', priority: 'high', created_at: 1720000000000,
              started_at: 1720000001000, finished_at: 1720000002234,
              result: { markdown: '# Title…', json: {}, extracted_by: 'playwright', duration_ms: 1234 }
            }, null, 2)} />
          </div>
          <div className="space-y-2">
            <SectionTitle method="DELETE" path="/v1/jobs/:id" desc="Cancel a queued or running job." />
            <CodeBlock label="cURL" content={curl('DELETE', '/v1/jobs/j_abc123')} />
          </div>
        </div>
      </Section>

      {/* Sessions */}
      <Section id="sessions">
        <h3 className="text-sm font-semibold">Sessions</h3>
        <div className="space-y-4">
          <div>
            <SectionTitle method="POST" path="/v1/sessions" desc="Create an authenticated session by logging in with credentials." />
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs mt-2">
              <Param name="type" type="credentials" required desc='Must be "credentials".' />
              <Param name="platform" type="string" required desc="instagram | tiktok | reddit | twitter | facebook | youtube" />
              <Param name="username" type="string" required desc="Account username or email." />
              <Param name="password" type="string" required desc="Account password (stored encrypted)." />
              <Param name="label" type="string" desc="Display label for this session." />
            </div>
            <div className="mt-2">
              <CodeBlock label="cURL" content={curl('POST', '/v1/sessions', '{"type":"credentials","platform":"instagram","username":"user","password":"pass","label":"my account"}')} />
            </div>
          </div>
          <SectionTitle method="GET" path="/v1/sessions" desc="List all sessions with their status." />
          <SectionTitle method="GET" path="/v1/sessions/:id/check" desc="Validate a session (re-checks cookies)." />
          <SectionTitle method="DELETE" path="/v1/sessions/:id" desc="Delete a session and its cookies." />
        </div>
      </Section>

      {/* Health */}
      <Section id="health">
        <SectionTitle method="GET" path="/v1/health" desc="Server health: CPU, RAM, pool status, queue depth." />
        <CodeBlock label="Response" content={JSON.stringify({
          status: 'ok', cpu_pct: 12.4, ram_pct: 34.1, ram_used_gb: 2.7, ram_total_gb: 7.9,
          pool_size: 0, pool_active: 0, pool_max: 4, queue_depth: 0, queue_running: 0, uptime_seconds: 3600
        }, null, 2)} />
      </Section>

      {/* WebSocket */}
      <Section id="ws">
        <SectionTitle method="WS" path="/v1/stream" desc="Real-time job events via WebSocket." />
        <p className="text-xs text-muted-foreground">Connect to receive <code className="text-foreground">job_update</code> events as jobs change state.</p>
        <CodeBlock label="Connect" content={`const ws = new WebSocket('${origin.replace('http', 'ws')}/v1/stream?key=${KEY}')`} />
        <CodeBlock label="Event payload" content={JSON.stringify({ type: 'job_update', job: { id: 'j_abc', status: 'done' } }, null, 2)} />
      </Section>

      {/* Browser Actions */}
      <Section id="actions">
        <h3 className="text-sm font-semibold">Browser Actions</h3>
        <p className="text-xs text-muted-foreground mb-3">Use in <code className="text-foreground">options.actions</code> to automate interactions before scraping.</p>
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs">
          <Param name="fill" type='{ type, selector, value }' desc="Type text into an input field." />
          <Param name="click" type='{ type, selector }' desc="Click a button or element." />
          <Param name="select" type='{ type, selector, value }' desc="Select an option in a <select> element." />
          <Param name="wait_for_selector" type='{ type, selector }' desc="Wait until an element appears in the DOM." />
          <Param name="wait_for_url" type='{ type, pattern }' desc="Wait until the URL matches a pattern." />
        </div>
        <CodeBlock label="Example: fill a search form and submit" content={JSON.stringify([
          { type: 'fill', selector: '#search-input', value: 'deepfetch' },
          { type: 'click', selector: 'button[type="submit"]' },
          { type: 'wait_for_selector', selector: '.results' },
        ], null, 2)} />
      </Section>

    </div>
  )
}

// ── Settings Page ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation()

  return (
    <div className="p-4 sm:p-6 max-w-3xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-base font-semibold">{t('settings.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('settings.subtitle')}</p>
      </div>

      <Tabs defaultValue="keys">
        <TabsList className="w-full sm:w-auto mb-6 grid grid-cols-3 sm:flex">
          <TabsTrigger value="keys" className="flex-1 sm:flex-none gap-1.5 text-xs sm:text-sm">
            <Key size={12} className="hidden sm:block" />
            {t('settings.tabs.keys')}
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex-1 sm:flex-none gap-1.5 text-xs sm:text-sm">
            <Sun size={12} className="hidden sm:block" />
            {t('settings.tabs.appearance')}
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex-1 sm:flex-none gap-1.5 text-xs sm:text-sm">
            <Globe size={12} className="hidden sm:block" />
            {t('settings.tabs.docs')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys"><KeysTab /></TabsContent>
        <TabsContent value="appearance"><AppearanceTab /></TabsContent>
        <TabsContent value="docs"><DocsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
