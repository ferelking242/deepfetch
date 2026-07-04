import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/useApi'
import { listKeys, createKey, deleteKey } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Key, Copy, Trash2, Plus, Eye, EyeOff, Check, Terminal, ExternalLink, AlertCircle } from 'lucide-react'
import { cn, fmtDate } from '@/lib/utils'

function CopyButton({ text, size = 'default' }: { text: string; size?: 'default' | 'sm' }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size={size === 'sm' ? 'icon' : 'sm'} onClick={copy}
      className={cn('transition-colors', copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground')}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {size !== 'sm' && (copied ? 'Copied' : 'Copy')}
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
      <pre className="p-4 text-xs text-foreground font-mono overflow-auto max-h-56 leading-relaxed bg-background/50">{content}</pre>
    </div>
  )
}

export default function Settings() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepfetch_api_key') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const { data, refetch } = useApi(listKeys, [])

  useEffect(() => { localStorage.setItem('deepfetch_api_key', apiKey) }, [apiKey])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const result = await createKey({ label: newLabel.trim() })
      setNewKey(result.key); setNewLabel(''); void refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const keys = data?.keys ?? []
  const origin = window.location.origin.replace('/dashboard', '')
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
        <p className="text-xs text-muted-foreground mt-0.5">API keys, authentication, and integrations</p>
      </div>

      {/* Active key */}
      <Card>
        <CardHeader>
          <CardTitle>Active API Key</CardTitle>
          <CardDescription>Used by this dashboard for all API calls. Saved in localStorage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your API key…"
                className="font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New key revealed */}
      {newKey && (
        <Card className="border-primary/30 bg-primary/5 animate-fade-in">
          <CardContent className="p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle size={14} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium text-primary">Save this key — it won't be shown again</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border px-3 py-2 rounded-md font-mono break-all">{newKey}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void navigator.clipboard.writeText(newKey); setApiKey(newKey) }}
              >
                <Copy size={12} /> Use
              </Button>
            </div>
            <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* API Keys */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">API Keys</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Generate keys for agents, CI, or external apps</p>
          </div>
        </div>

        <form onSubmit={e => void handleCreate(e)} className="flex gap-2">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Key label — e.g. claude-agent, github-ci"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={creating || !newLabel.trim()}>
            <Plus size={13} />
            {creating ? 'Generating…' : 'Generate'}
          </Button>
        </form>

        <Card>
          {keys.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
              <Key size={24} className="opacity-20" />
              <p className="text-sm">No API keys yet</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Rate limit</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(k => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium text-sm">{k.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{k.rate_limit_per_minute} req/min</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(k.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(k.last_used)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { if (confirm('Revoke this key?')) void deleteKey(k.id).then(() => void refetch()) }}
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

      {/* MCP Connect */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">MCP Connect</h2>
            <Badge variant="default">Claude · Cursor · Cline</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Expose DeepFetch as native tools to any MCP-compatible agent.
            Tools auto-discovered: <code className="text-xs bg-muted px-1 rounded">scrape_url</code>{' '}
            <code className="text-xs bg-muted px-1 rounded">crawl_website</code>{' '}
            <code className="text-xs bg-muted px-1 rounded">batch_scrape</code>{' '}
            <code className="text-xs bg-muted px-1 rounded">get_job</code>
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
