import { useState } from 'react'
import { useApi } from '@/hooks/useApi'
import { listSessions, deleteSession, checkSession, createSessionCredentials } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, RefreshCw, Shield, ShieldCheck, ShieldX, Trash2 } from 'lucide-react'
import { cn, fmtDate } from '@/lib/utils'

const PLATFORMS = ['instagram', 'tiktok', 'reddit', 'twitter', 'facebook', 'youtube']

const STATUS_CFG = {
  active:  { icon: ShieldCheck, variant: 'success'     as const, label: 'Active'  },
  expired: { icon: ShieldX,     variant: 'warning'     as const, label: 'Expired' },
  invalid: { icon: ShieldX,     variant: 'destructive' as const, label: 'Invalid' },
}

export default function Sessions() {
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheck = async (id: string) => {
    setCheckingId(id)
    try {
      const r = await checkSession(id)
      alert(`Session ${r.valid ? '✅ valid' : '❌ invalid / expired'}`)
      void refetch()
    } finally {
      setCheckingId(null)
    }
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Sessions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Authenticated browser sessions for gated content</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => void refetch()}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button size="sm" onClick={() => setShowAdd(s => !s)}>
            <Plus size={13} /> Add session
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Login with credentials</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => void handleAdd(e)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Platform</label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Label (optional)</label>
                  <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="my-account" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Username</label>
                  <Input required value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Password</label>
                  <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? <RefreshCw size={12} className="animate-spin" /> : null}
                  {submitting ? 'Logging in…' : 'Login & save'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        {sessions.length === 0 && !loading ? (
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <Shield size={32} className="opacity-20" />
            <p className="text-sm">No sessions yet</p>
            <p className="text-xs">Add a session to scrape authenticated content</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Cookies</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map(s => {
                const cfg = STATUS_CFG[s.status]
                const Icon = cfg.icon
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon size={13} className={cn(
                          s.status === 'active' ? 'text-emerald-500' :
                          s.status === 'expired' ? 'text-amber-500' : 'text-destructive'
                        )} />
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{s.label}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{s.platform}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.cookie_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={checkingId === s.id}
                          onClick={() => void handleCheck(s.id)}
                        >
                          {checkingId === s.id ? 'Checking…' : 'Verify'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm('Delete session?')) void deleteSession(s.id).then(() => void refetch()) }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
