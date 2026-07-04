import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '@/hooks/useApi'
import { listSessions, deleteSession, checkSession, createSessionCredentials } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, RefreshCw, Shield, ShieldCheck, ShieldX, Trash2, CheckCircle2 } from 'lucide-react'
import { cn, fmtDate, ago } from '@/lib/utils'
import type { SessionSummary } from '@/lib/api'

const PLATFORMS = ['instagram', 'tiktok', 'reddit', 'twitter', 'facebook', 'youtube']

const STATUS_CFG = {
  active:  { icon: ShieldCheck, variant: 'success'     as const },
  expired: { icon: ShieldX,     variant: 'warning'     as const },
  invalid: { icon: ShieldX,     variant: 'destructive' as const },
}

function MobileSessionCard({ session, onCheck, onDelete, checking }: {
  session: SessionSummary
  onCheck: (id: string) => void
  onDelete: (id: string) => void
  checking: boolean
}) {
  const { t } = useTranslation()
  const cfg = STATUS_CFG[session.status]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant={cfg.variant} className="text-[10px]">
                {t(`sessions.status.${session.status}`)}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{session.platform}</Badge>
            </div>
            <p className="text-sm font-medium truncate">{session.label}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span>{session.cookie_count} cookies</span>
              <span>{ago(session.last_checked)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => onCheck(session.id)}
              disabled={checking}
            >
              {checking ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(session.id)}
            >
              <Trash2 size={11} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Sessions() {
  const { t } = useTranslation()
  const { data, loading, refetch } = useApi(listSessions, [], 10000)
  const [showAdd, setShowAdd] = useState(false)
  const [platform, setPlatform] = useState('instagram')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const sessions = data?.sessions ?? []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createSessionCredentials({ type: 'credentials', platform, username, password, label: label || undefined })
      setUsername(''); setPassword(''); setLabel('')
      setShowAdd(false)
      void refetch()
      toast.success('Session created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sessions.loginError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheck = async (id: string) => {
    setCheckingId(id)
    try {
      const r = await checkSession(id)
      toast[r.valid ? 'success' : 'warning'](r.valid ? 'Session is valid' : 'Session is invalid')
      void refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setCheckingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id)
      void refetch()
      toast.success('Session removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{t('sessions.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('sessions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refetch()}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setShowAdd(s => !s)} className="gap-1.5">
            <Plus size={13} />
            <span className="hidden sm:inline">{t('sessions.add')}</span>
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('sessions.add')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => void handleAdd(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('sessions.platform')}</label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('sessions.label')}</label>
                  <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="My account"
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('sessions.username')}</label>
                  <Input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    className="text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('sessions.password')}</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="text-sm"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={submitting || !username || !password} className="gap-1">
                  {submitting ? <RefreshCw size={11} className="animate-spin" /> : null}
                  {submitting ? t('common.loading') : t('sessions.login')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Mobile: cards */}
      <div className="lg:hidden space-y-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Shield size={32} className="opacity-20" />
            <p className="text-sm">{loading ? t('common.loading') : t('sessions.empty')}</p>
            {!loading && <p className="text-xs text-center max-w-xs opacity-60">{t('sessions.emptyHint')}</p>}
          </div>
        ) : sessions.map(s => (
          <MobileSessionCard
            key={s.id}
            session={s}
            onCheck={handleCheck}
            onDelete={handleDelete}
            checking={checkingId === s.id}
          />
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">{t('sessions.table.status')}</TableHead>
              <TableHead className="w-28">{t('sessions.table.platform')}</TableHead>
              <TableHead>{t('sessions.table.label')}</TableHead>
              <TableHead className="w-20">{t('sessions.table.cookies')}</TableHead>
              <TableHead className="w-32">{t('sessions.table.checked')}</TableHead>
              <TableHead className="w-32">{t('sessions.table.created')}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Shield size={24} className="opacity-20" />
                    <p className="text-sm">{loading ? t('common.loading') : t('sessions.empty')}</p>
                    {!loading && <p className="text-xs opacity-60">{t('sessions.emptyHint')}</p>}
                  </div>
                </TableCell>
              </TableRow>
            ) : sessions.map(s => {
              const cfg = STATUS_CFG[s.status]
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Badge variant={cfg.variant} className="text-[10px]">
                      {t(`sessions.status.${s.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] capitalize">{s.platform}</Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{s.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.cookie_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ago(s.last_checked)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => void handleCheck(s.id)}
                        disabled={checkingId === s.id}
                        title={t('sessions.check')}
                      >
                        {checkingId === s.id
                          ? <RefreshCw size={11} className="animate-spin" />
                          : <CheckCircle2 size={11} />
                        }
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDelete(s.id)}
                      >
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
