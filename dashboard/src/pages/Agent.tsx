import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { runAgent, actOnPage, extractFromPage, observePage, getAgentCacheStats, clearAgentCache } from '@/lib/api'
import type { AgentEvent, ActRequest, ExtractRequest, ObserveRequest } from '@/lib/api'
import { MobileNotice } from '@/components/MobileNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Bot, Play, Square, Loader2, CheckCircle2, AlertCircle, Clock,
  Zap, Eye, Database, Terminal, Globe, Search, FileCode, Image,
  ChevronDown, ChevronRight, Copy, Check, Trash2, RotateCcw,
  MousePointerClick, ScanText, ScanSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'

// ── Tool config ────────────────────────────────────────────────────────────────

const ALL_TOOLS = [
  { id: 'navigate',   label: 'navigate',   icon: Globe,             desc: 'Go to URLs' },
  { id: 'act',        label: 'act',        icon: MousePointerClick, desc: 'AI browser interactions' },
  { id: 'extract',    label: 'extract',    icon: ScanText,          desc: 'Structured data extraction' },
  { id: 'observe',    label: 'observe',    icon: ScanSearch,        desc: 'List page elements' },
  { id: 'screenshot', label: 'screenshot', icon: Image,             desc: 'Capture page screenshot' },
  { id: 'web_search', label: 'web_search', icon: Search,            desc: 'Search the web' },
  { id: 'get_text',   label: 'get_text',   icon: FileCode,          desc: 'Get page text' },
  { id: 'run_js',     label: 'run_js',     icon: Terminal,          desc: 'Evaluate JavaScript' },
]

// ── Event display ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ElementType> = {
  navigate: Globe, act: MousePointerClick, extract: ScanText, observe: ScanSearch,
  screenshot: Image, web_search: Search, get_text: FileCode, run_js: Terminal, done: CheckCircle2,
}

const TOOL_COLORS: Record<string, string> = {
  navigate:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  act:        'text-violet-400 bg-violet-500/10 border-violet-500/20',
  extract:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  observe:    'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  screenshot: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  web_search: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  get_text:   'text-pink-400 bg-pink-500/10 border-pink-500/20',
  run_js:     'text-red-400 bg-red-500/10 border-red-500/20',
  done:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors p-1">
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  )
}

function JsonBlock({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false)
  const str = JSON.stringify(data, null, 2)
  const preview = str.length > 200 ? str.slice(0, 200) + '…' : str

  return (
    <div className="mt-2 rounded-md border border-border overflow-hidden text-[11px] font-mono">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left text-muted-foreground hover:text-foreground bg-muted/20 border-b border-border transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{open ? 'Hide' : 'Show'} JSON</span>
        <CopyBtn text={str} />
      </button>
      {open && (
        <pre className="p-3 overflow-auto max-h-64 bg-background/40 text-foreground whitespace-pre-wrap break-all leading-relaxed">
          {str}
        </pre>
      )}
      {!open && (
        <div className="px-3 py-2 text-muted-foreground truncate bg-background/20">{preview}</div>
      )}
    </div>
  )
}

function EventCard({ event, index }: { event: AgentEvent; index: number }) {
  if (event.type === 'start') {
    return (
      <div className="flex items-start gap-3 px-1">
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={13} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-primary">Agent started</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{event.task}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {event.tools.map(t => (
              <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">{t}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1">via {event.provider} · max {event.max_steps} steps</p>
        </div>
      </div>
    )
  }

  if (event.type === 'step') {
    const Icon = TOOL_ICONS[event.tool] ?? Zap
    const colors = TOOL_COLORS[event.tool] ?? 'text-muted-foreground bg-muted border-border'
    const args = event.args
    const mainArg = args.url ?? args.instruction ?? args.query ?? args.code ?? args.result
    return (
      <div className="flex items-start gap-3 px-1">
        <div className={cn('w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5', colors)}>
          <Icon size={12} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">Step {index + 1}</span>
            <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', colors)}>{event.tool}</span>
          </div>
          {event.thought && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed italic">"{event.thought}"</p>
          )}
          {mainArg !== undefined && (
            <p className="text-[11px] font-mono text-foreground/70 mt-1 truncate">
              {String(mainArg).slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (event.type === 'tool_result') {
    const success = !((event.result as Record<string, unknown>)?.error || (event.result as Record<string, unknown>)?.success === false)
    return (
      <div className="flex items-start gap-3 px-1 pl-10">
        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', success ? 'bg-emerald-500/15' : 'bg-red-500/15')}>
          {success ? <Check size={10} className="text-emerald-500" /> : <AlertCircle size={10} className="text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{success ? 'Success' : 'Failed'}</span>
            <span className="text-[10px] text-muted-foreground/50">{event.duration_ms}ms</span>
            {event.url && <span className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">{event.url}</span>}
          </div>
          {event.result !== null && <JsonBlock data={event.result} />}
        </div>
      </div>
    )
  }

  if (event.type === 'done') {
    return (
      <div className="flex items-start gap-3 px-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-500">Complete</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{event.summary}</p>
          <div className="flex gap-3 text-[10px] text-muted-foreground mt-1.5">
            <span>{event.total_steps} steps</span>
            <span>{(event.duration_ms / 1000).toFixed(1)}s</span>
          </div>
          {event.result !== null && <JsonBlock data={event.result} />}
        </div>
      </div>
    )
  }

  if (event.type === 'error') {
    return (
      <div className="flex items-start gap-3 px-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
        <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-400">Error{event.step ? ` at step ${event.step}` : ''}</p>
          <p className="text-[11px] font-mono text-red-400/80 mt-1 break-all">{event.message}</p>
        </div>
      </div>
    )
  }

  return null
}

// ── Agent Tab ──────────────────────────────────────────────────────────────────

function AgentTab() {
  const { t } = useTranslation()
  const [task, setTask] = useState('')
  const [maxSteps, setMaxSteps] = useState(15)
  const [sessionId, setSessionId] = useState('')
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(ALL_TOOLS.map(t => t.id)))
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [running, setRunning] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<AgentEvent> | null>(null)

  const toggleTool = (id: string) => {
    setEnabledTools(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const scrollFeed = () => setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)

  const run = useCallback(async () => {
    if (!task.trim()) return
    setEvents([])
    setRunning(true)

    const stream = runAgent({
      task: task.trim(),
      tools: Array.from(enabledTools),
      max_steps: maxSteps,
      session_id: sessionId.trim() || undefined,
    })

    const reader = stream.getReader()
    readerRef.current = reader

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setEvents(prev => [...prev, value])
        scrollFeed()
        if (value.type === 'done' || value.type === 'error') break
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRunning(false)
      readerRef.current = null
    }
  }, [task, enabledTools, maxSteps, sessionId])

  const stop = () => {
    readerRef.current?.cancel().catch(() => null)
    setRunning(false)
    toast.info('Agent stopped')
  }

  const EXAMPLE_TASKS = [
    'Go to https://news.ycombinator.com and extract the top 10 stories with their titles, URLs, and point counts',
    'Search for "best open source AI agents 2025" and summarize the top 5 results',
    'Go to https://github.com/trending and extract the top 5 trending repos with stars and descriptions',
    'Navigate to https://quotes.toscrape.com and extract all quotes with authors from the first 3 pages',
  ]

  const doneEvent = events.find(e => e.type === 'done') as Extract<AgentEvent, { type: 'done' }> | undefined
  const errorEvent = events.find(e => e.type === 'error') as Extract<AgentEvent, { type: 'error' }> | undefined
  const stepEvents = events.filter(e => e.type === 'step' || e.type === 'tool_result')

  return (
    <div className="space-y-5">
      {/* Task input */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot size={14} className="text-primary" />
            {t('agent.task')}
          </CardTitle>
          <CardDescription className="text-xs">{t('agent.taskDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <Textarea
            rows={4}
            placeholder={t('agent.taskPlaceholder')}
            value={task}
            onChange={e => setTask(e.target.value)}
            className="resize-y text-sm"
            disabled={running}
          />

          {/* Examples */}
          {!task && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t('agent.examples')}</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_TASKS.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setTask(ex)}
                    className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors text-left max-w-[260px] truncate"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('agent.maxSteps')}</label>
              <Input type="number" min={1} max={50} value={maxSteps} onChange={e => setMaxSteps(Number(e.target.value))} className="h-9" disabled={running} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('agent.sessionId')}</label>
              <Input placeholder="sess_abc123" value={sessionId} onChange={e => setSessionId(e.target.value)} className="h-9 font-mono text-xs" disabled={running} />
            </div>
          </div>

          {/* Tools */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">{t('agent.tools')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ALL_TOOLS.map(tool => {
                const Icon = tool.icon
                const active = enabledTools.has(tool.id)
                return (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    disabled={running}
                    title={tool.desc}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-all',
                      active
                        ? cn(TOOL_COLORS[tool.id], 'border-opacity-40')
                        : 'border-border text-muted-foreground opacity-40 hover:opacity-60'
                    )}
                  >
                    <Icon size={11} className="flex-shrink-0" />
                    <span className="font-mono truncate">{tool.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Run / Stop */}
          <div className="flex gap-2">
            <Button
              onClick={() => void run()}
              disabled={running || !task.trim()}
              className="gap-2 h-10 flex-1 sm:flex-none"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? t('agent.running') : t('agent.run')}
            </Button>
            {running && (
              <Button variant="outline" onClick={stop} className="gap-2 h-10">
                <Square size={13} /> {t('agent.stop')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Event feed */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock size={12} className="text-muted-foreground" />
                {t('agent.steps')}
                <span className="text-xs font-normal text-muted-foreground">({stepEvents.length / 2} steps)</span>
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEvents([])}>
                <RotateCcw size={11} className="mr-1" /> Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-4">
              {events.map((event, i) => (
                <EventCard key={i} event={event} index={i} />
              ))}
              {running && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse px-1">
                  <Loader2 size={12} className="animate-spin" />
                  Agent working…
                </div>
              )}
              <div ref={feedRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick result when done */}
      {doneEvent && !running && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-500">{t('agent.done')}</span>
              </div>
              <CopyBtn text={JSON.stringify(doneEvent.result, null, 2)} />
            </div>
            <p className="text-xs text-muted-foreground">{doneEvent.summary}</p>
            <pre className="text-[11px] font-mono bg-background/60 border border-border rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all text-foreground leading-relaxed">
              {JSON.stringify(doneEvent.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {errorEvent && !running && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex gap-2">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-xs text-red-400/80 mt-1 font-mono">{errorEvent.message}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Act Tab ────────────────────────────────────────────────────────────────────

function ActTab() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [instruction, setInstruction] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [useCache, setUseCache] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!url || !instruction) return
    setRunning(true); setResult(null); setError(null)
    try {
      const req: ActRequest = { url, instruction, session_id: sessionId || undefined, use_cache: useCache }
      const res = await actOnPage(req)
      setResult(res)
      toast.success(`Action executed: ${res.action_type} on ${res.selector}${res.cached ? ' (cached)' : ''}`)
    } catch (err) { setError((err as Error).message); toast.error((err as Error).message) }
    finally { setRunning(false) }
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm flex items-center gap-2"><MousePointerClick size={13} className="text-violet-400" /> {t('agent.actTitle')}</CardTitle>
        <CardDescription className="text-xs">{t('agent.actDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">URL <span className="text-destructive">*</span></label>
          <Input type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">{t('agent.instruction')} <span className="text-destructive">*</span></label>
          <Input placeholder={t('agent.actPlaceholder')} value={instruction} onChange={e => setInstruction(e.target.value)} className="h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Session ID (optional)</label>
            <Input placeholder="sess_abc123" value={sessionId} onChange={e => setSessionId(e.target.value)} className="h-9 font-mono text-xs" />
          </div>
          <div className="flex items-end pb-0.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center', useCache ? 'bg-primary border-primary' : 'border-border')} onClick={() => setUseCache(c => !c)}>
                {useCache && <Check size={11} className="text-primary-foreground" />}
              </div>
              <span className="text-sm text-muted-foreground">{t('agent.useCache')}</span>
            </label>
          </div>
        </div>

        <Button onClick={() => void run()} disabled={running || !url || !instruction} className="gap-2 h-10 w-full sm:w-auto">
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {running ? t('agent.running') : t('agent.runAct')}
        </Button>

        {result && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            {(() => {
              const r = result as { success: boolean; selector: string; action_type: string; value: string | null; cached: boolean; reasoning: string }
              return (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant={r.success ? 'default' : 'destructive'}>{r.success ? 'success' : 'failed'}</Badge>
                    <span className="font-mono text-muted-foreground">{r.action_type}</span>
                    {r.cached && <Badge variant="secondary" className="text-[9px]">cached</Badge>}
                  </div>
                  <p className="text-[11px] font-mono text-foreground/80 break-all">{r.selector}</p>
                  {r.value && <p className="text-[11px] text-muted-foreground">value: <span className="font-mono">{r.value}</span></p>}
                  <p className="text-[10px] text-muted-foreground/70 italic">{r.reasoning}</p>
                </>
              )
            })()}
          </div>
        )}
        {error && <p className="text-xs text-destructive font-mono">{error}</p>}
      </CardContent>
    </Card>
  )
}

// ── Extract Tab ────────────────────────────────────────────────────────────────

function ExtractTab() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [instruction, setInstruction] = useState('')
  const [schemaJson, setSchemaJson] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  const SCHEMA_EXAMPLES = [
    { label: 'Article', schema: '{\n  "title": {"type":"string","description":"Article title"},\n  "author": {"type":"string","description":"Author name"},\n  "date": {"type":"string","description":"Publication date"},\n  "content": {"type":"string","description":"Main content"}\n}' },
    { label: 'Product', schema: '{\n  "name": {"type":"string","description":"Product name"},\n  "price": {"type":"number","description":"Price in USD"},\n  "rating": {"type":"number","description":"Rating out of 5"},\n  "reviews": {"type":"number","description":"Number of reviews"}\n}' },
    { label: 'GitHub', schema: '{\n  "repo_name": {"type":"string","description":"Repository name"},\n  "stars": {"type":"number","description":"Star count"},\n  "description": {"type":"string","description":"Repo description"},\n  "language": {"type":"string","description":"Main language"}\n}' },
  ]

  const run = async () => {
    if (!url || !instruction) return
    setRunning(true); setResult(null); setError(null)
    try {
      let schema: Record<string, unknown> | undefined
      if (schemaJson.trim()) {
        try { schema = JSON.parse(schemaJson) }
        catch { throw new Error('Invalid JSON schema') }
      }
      const req: ExtractRequest = { url, instruction, schema, session_id: sessionId || undefined }
      const res = await extractFromPage(req)
      setResult(res)
      toast.success('Extraction complete')
    } catch (err) { setError((err as Error).message); toast.error((err as Error).message) }
    finally { setRunning(false) }
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm flex items-center gap-2"><ScanText size={13} className="text-emerald-400" /> {t('agent.extractTitle')}</CardTitle>
        <CardDescription className="text-xs">{t('agent.extractDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">URL <span className="text-destructive">*</span></label>
          <Input type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">{t('agent.instruction')} <span className="text-destructive">*</span></label>
          <Input placeholder={t('agent.extractPlaceholder')} value={instruction} onChange={e => setInstruction(e.target.value)} className="h-10" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">JSON Schema (optional)</label>
            <div className="flex gap-1">
              {SCHEMA_EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => setSchemaJson(ex.schema)}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground">
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea rows={6} placeholder={'{\n  "title": {"type":"string","description":"Page title"},\n  "price": {"type":"number","description":"Price"}\n}'} value={schemaJson} onChange={e => setSchemaJson(e.target.value)} className="font-mono text-xs resize-y" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Session ID (optional)</label>
          <Input placeholder="sess_abc123" value={sessionId} onChange={e => setSessionId(e.target.value)} className="h-9 font-mono text-xs" />
        </div>
        <Button onClick={() => void run()} disabled={running || !url || !instruction} className="gap-2 h-10 w-full sm:w-auto">
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {running ? t('agent.running') : t('agent.runExtract')}
        </Button>
        {result && (
          <pre className="text-[11px] font-mono bg-muted/20 border border-border rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {error && <p className="text-xs text-destructive font-mono">{error}</p>}
      </CardContent>
    </Card>
  )
}

// ── Observe Tab ────────────────────────────────────────────────────────────────

function ObserveTab() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!url) return
    setRunning(true); setResult(null); setError(null)
    try {
      const req: ObserveRequest = { url, session_id: sessionId || undefined }
      const res = await observePage(req)
      setResult(res)
      toast.success(`Found ${res.elements.length} interactive elements`)
    } catch (err) { setError((err as Error).message); toast.error((err as Error).message) }
    finally { setRunning(false) }
  }

  const obs = result as { page_purpose?: string; elements?: Array<{ description: string; selector: string; action: string; value_hint: string | null }> } | null

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm flex items-center gap-2"><ScanSearch size={13} className="text-cyan-400" /> {t('agent.observeTitle')}</CardTitle>
        <CardDescription className="text-xs">{t('agent.observeDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">URL <span className="text-destructive">*</span></label>
            <Input type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} className="h-10" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Session ID (optional)</label>
            <Input placeholder="sess_abc123" value={sessionId} onChange={e => setSessionId(e.target.value)} className="h-10 font-mono text-xs" />
          </div>
        </div>
        <Button onClick={() => void run()} disabled={running || !url} className="gap-2 h-10 w-full sm:w-auto">
          {running ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          {running ? t('agent.running') : t('agent.runObserve')}
        </Button>
        {obs && (
          <div className="space-y-3">
            {obs.page_purpose && (
              <div className="rounded-lg bg-muted/20 border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Page purpose</p>
                <p className="text-sm text-foreground">{obs.page_purpose}</p>
              </div>
            )}
            <div className="space-y-1.5">
              {obs.elements?.map((el, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                  <span className={cn('text-[9px] font-mono px-1 py-0.5 rounded border mt-0.5 flex-shrink-0', TOOL_COLORS['act'] ?? 'border-border text-muted-foreground bg-muted')}>{el.action}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">{el.description}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{el.selector}</p>
                    {el.value_hint && <p className="text-[10px] text-muted-foreground/60">{el.value_hint}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive font-mono">{error}</p>}
      </CardContent>
    </Card>
  )
}

// ── Cache Tab ──────────────────────────────────────────────────────────────────

function CacheTab() {
  const { t } = useTranslation()
  const { data: stats, refetch } = useApi(getAgentCacheStats, [])

  const clearCache = async () => {
    try { await clearAgentCache(); void refetch(); toast.success('Cache cleared') }
    catch (err) { toast.error((err as Error).message) }
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Database size={13} className="text-amber-400" /> {t('agent.cacheTitle')}</CardTitle>
            <CardDescription className="text-xs mt-1">{t('agent.cacheDesc')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void clearCache()} className="gap-1.5 h-8 text-xs">
            <Trash2 size={11} /> {t('agent.clearCache')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/20 border border-border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('agent.cachedActions')}</p>
          </div>
          <div className="rounded-lg bg-muted/20 border border-border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats?.hits ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('agent.cacheHits')}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <p>🧠 <strong>Stagehand-style caching</strong> — AI-resolved selectors are cached by <code className="font-mono text-foreground/70">(hostname + instruction)</code> hash in SQLite.</p>
          <p>⚡ Cache hits skip the LLM call entirely, making repeated automations instant and free.</p>
          <p>♻️ Entries auto-expire after 7 days of inactivity.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Agent page ────────────────────────────────────────────────────────────

export default function Agent() {
  const { t } = useTranslation()

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          {t('agent.title')}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('agent.subtitle')}</p>
      </div>

      <MobileNotice pageKey="agent" message={t('common.mobileNotice')} />

      <Tabs defaultValue="agent">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex mb-1">
          <TabsTrigger value="agent"   className="gap-1 flex-1 sm:flex-none text-xs sm:text-sm"><Bot size={11} /> {t('agent.tabs.agent')}</TabsTrigger>
          <TabsTrigger value="act"     className="gap-1 flex-1 sm:flex-none text-xs sm:text-sm"><MousePointerClick size={11} /> {t('agent.tabs.act')}</TabsTrigger>
          <TabsTrigger value="extract" className="gap-1 flex-1 sm:flex-none text-xs sm:text-sm"><ScanText size={11} /> {t('agent.tabs.extract')}</TabsTrigger>
          <TabsTrigger value="observe" className="gap-1 flex-1 sm:flex-none text-xs sm:text-sm"><Eye size={11} /> {t('agent.tabs.observe')}</TabsTrigger>
        </TabsList>

        <TabsContent value="agent"><AgentTab /></TabsContent>
        <TabsContent value="act"><ActTab /></TabsContent>
        <TabsContent value="extract"><ExtractTab /></TabsContent>
        <TabsContent value="observe"><ObserveTab /></TabsContent>
      </Tabs>

      <Separator />
      <CacheTab />
    </div>
  )
}
