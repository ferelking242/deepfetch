import { useState, useRef } from 'react'
import { scrape, crawl, batch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Play, Loader2, Copy, Check, ChevronDown, ChevronRight,
  Zap, Globe, Layers, Clock, CheckCircle2, AlertCircle
} from 'lucide-react'
import { cn, fmtDuration } from '@/lib/utils'
import type { ScrapeRequest, CrawlRequest, BatchRequest } from '@/lib/api'

type OutputFmt = 'markdown' | 'json' | 'html' | 'screenshot'
const OUTPUT_FMTS: OutputFmt[] = ['markdown', 'json', 'html', 'screenshot']

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 px-3 rounded-md text-xs font-medium border transition-colors',
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-border/80'
      )}
    >
      {label}
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-muted-foreground mb-1.5 font-medium">{children}</label>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size="sm" onClick={copy} className={cn('h-7 gap-1.5 text-xs', copied ? 'text-emerald-500' : 'text-muted-foreground')}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function CollapsibleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground bg-muted/30 border-b border-border transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && (
        <pre className="p-4 text-xs font-mono text-foreground overflow-auto max-h-80 bg-background/50 leading-relaxed">
          {children}
        </pre>
      )}
    </div>
  )
}

export default function Playground() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  // Scrape state
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeOutput, setScrapeOutput] = useState<OutputFmt[]>(['markdown', 'json'])
  const [scrapeSync, setScrapeSync] = useState(true)
  const [scrapePriority, setScrapePriority] = useState<'high' | 'normal' | 'batch'>('high')
  const [scrapeWaitFor, setScrapeWaitFor] = useState('')
  const [scrapeScroll, setScrapeScroll] = useState(false)
  const [scrapeActions, setScrapeActions] = useState('')

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawlDepth, setCrawlDepth] = useState(2)
  const [crawlLimit, setCrawlLimit] = useState(20)
  const [crawlSameDomain, setCrawlSameDomain] = useState(true)
  const [crawlExclude, setCrawlExclude] = useState('')

  // Batch state
  const [batchUrls, setBatchUrls] = useState('')
  const [batchOutput, setBatchOutput] = useState<OutputFmt[]>(['markdown'])
  const [batchPriority, setBatchPriority] = useState<'high' | 'normal' | 'batch'>('batch')

  const toggleFmt = (fmt: OutputFmt, list: OutputFmt[], setter: (v: OutputFmt[]) => void) =>
    setter(list.includes(fmt) ? list.filter(f => f !== fmt) : [...list, fmt])

  const run = async (mode: string) => {
    setRunning(true); setResult(null); setError(null); setDuration(null)
    const t0 = Date.now()
    try {
      let res: unknown
      if (mode === 'scrape') {
        const body: ScrapeRequest = {
          url: scrapeUrl,
          priority: scrapePriority,
          sync: scrapeSync,
          output: scrapeOutput.length ? scrapeOutput : ['markdown'],
          options: {
            ...(scrapeWaitFor ? { wait_for: scrapeWaitFor } : {}),
            ...(scrapeScroll ? { scroll: true } : {}),
          },
        }
        if (scrapeActions.trim()) {
          try {
            body.options = { ...body.options, actions: JSON.parse(scrapeActions) }
          } catch { throw new Error('Actions: invalid JSON') }
        }
        res = await scrape(body)
      } else if (mode === 'crawl') {
        const body: CrawlRequest = {
          url: crawlUrl,
          depth: crawlDepth,
          limit: crawlLimit,
          same_domain: crawlSameDomain,
          ...(crawlExclude.trim() ? { exclude_patterns: crawlExclude.split('\n').map(s => s.trim()).filter(Boolean) } : {}),
        }
        res = await crawl(body)
      } else {
        const urls = batchUrls.split('\n').map(s => s.trim()).filter(Boolean)
        if (!urls.length) throw new Error('Enter at least one URL')
        const body: BatchRequest = {
          urls,
          priority: batchPriority,
          output: batchOutput.length ? batchOutput : ['markdown'],
        }
        res = await batch(body)
      }
      setResult(res)
      setDuration(Date.now() - t0)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-base font-semibold">Playground</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Test the DeepFetch API interactively</p>
      </div>

      <Tabs defaultValue="scrape">
        <TabsList className="mb-1">
          <TabsTrigger value="scrape" className="gap-2"><Zap size={12} />Scrape</TabsTrigger>
          <TabsTrigger value="crawl" className="gap-2"><Globe size={12} />Crawl</TabsTrigger>
          <TabsTrigger value="batch" className="gap-2"><Layers size={12} />Batch</TabsTrigger>
        </TabsList>

        {/* ─── SCRAPE ─── */}
        <TabsContent value="scrape">
          <Card>
            <CardHeader>
              <CardTitle>Scrape a URL</CardTitle>
              <CardDescription>Extract content, data, or screenshots from any page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FieldLabel>URL *</FieldLabel>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={scrapeUrl}
                  onChange={e => setScrapeUrl(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <div className="flex gap-1.5">
                    {(['high', 'normal', 'batch'] as const).map(p => (
                      <ToggleChip key={p} label={p} active={scrapePriority === p} onClick={() => setScrapePriority(p)} />
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>Output formats</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {OUTPUT_FMTS.map(f => (
                      <ToggleChip key={f} label={f} active={scrapeOutput.includes(f)}
                        onClick={() => toggleFmt(f, scrapeOutput, setScrapeOutput)} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={scrapeSync} onChange={e => setScrapeSync(e.target.checked)} className="accent-primary" />
                  Sync (wait for result)
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={scrapeScroll} onChange={e => setScrapeScroll(e.target.checked)} className="accent-primary" />
                  Auto-scroll
                </label>
              </div>

              <div>
                <FieldLabel>Wait for selector <span className="font-normal text-muted-foreground/70">(optional)</span></FieldLabel>
                <Input placeholder="#content, .app, [data-loaded]" value={scrapeWaitFor} onChange={e => setScrapeWaitFor(e.target.value)} />
              </div>

              <div>
                <FieldLabel>Browser actions JSON <span className="font-normal text-muted-foreground/70">(optional — fill / click / wait_for_selector / select)</span></FieldLabel>
                <Textarea
                  rows={3}
                  placeholder={`[{"type":"fill","selector":"#q","value":"deepfetch"},{"type":"click","selector":"button[type=submit]"}]`}
                  value={scrapeActions}
                  onChange={e => setScrapeActions(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <Button
                onClick={() => void run('scrape')}
                disabled={running || !scrapeUrl.trim()}
                className="gap-2"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? 'Running…' : 'Run scrape'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CRAWL ─── */}
        <TabsContent value="crawl">
          <Card>
            <CardHeader>
              <CardTitle>Crawl a website</CardTitle>
              <CardDescription>Follow links from a seed URL and scrape multiple pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FieldLabel>Seed URL *</FieldLabel>
                <Input type="url" placeholder="https://docs.example.com" value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <FieldLabel>Max depth <span className="text-muted-foreground/60">(1–5)</span></FieldLabel>
                  <Input type="number" min={1} max={5} value={crawlDepth} onChange={e => setCrawlDepth(Number(e.target.value))} />
                </div>
                <div>
                  <FieldLabel>Max pages</FieldLabel>
                  <Input type="number" min={1} max={1000} value={crawlLimit} onChange={e => setCrawlLimit(Number(e.target.value))} />
                </div>
                <div className="flex flex-col justify-end pb-0.5">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={crawlSameDomain} onChange={e => setCrawlSameDomain(e.target.checked)} className="accent-primary" />
                    Same domain only
                  </label>
                </div>
              </div>
              <div>
                <FieldLabel>Exclude URL patterns <span className="text-muted-foreground/60">(one per line)</span></FieldLabel>
                <Textarea rows={3} placeholder={"/login\n/logout\n/admin"} value={crawlExclude} onChange={e => setCrawlExclude(e.target.value)} className="font-mono text-xs" />
              </div>
              <Button onClick={() => void run('crawl')} disabled={running || !crawlUrl.trim()} className="gap-2">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? 'Running…' : 'Start crawl'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BATCH ─── */}
        <TabsContent value="batch">
          <Card>
            <CardHeader>
              <CardTitle>Batch scrape</CardTitle>
              <CardDescription>Scrape multiple URLs in parallel. One URL per line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FieldLabel>URLs * <span className="text-muted-foreground/60">(one per line)</span></FieldLabel>
                <Textarea
                  rows={7}
                  placeholder={"https://github.com/ferelking242/deepfetch\nhttps://news.ycombinator.com\nhttps://example.com"}
                  value={batchUrls}
                  onChange={e => setBatchUrls(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <div className="flex gap-1.5">
                    {(['high', 'normal', 'batch'] as const).map(p => (
                      <ToggleChip key={p} label={p} active={batchPriority === p} onClick={() => setBatchPriority(p)} />
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>Output formats</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {OUTPUT_FMTS.filter(f => f !== 'screenshot').map(f => (
                      <ToggleChip key={f} label={f} active={batchOutput.includes(f)}
                        onClick={() => toggleFmt(f, batchOutput, setBatchOutput)} />
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={() => void run('batch')} disabled={running || !batchUrls.trim()} className="gap-2">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? 'Running…' : `Batch scrape (${batchUrls.split('\n').filter(s => s.trim()).length} URLs)`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── RESULTS ─── */}
      <div ref={resultRef} className="space-y-3">
        {error && (
          <Card className="border-destructive/30 bg-destructive/5 animate-fade-in">
            <CardContent className="p-4 flex items-start gap-2.5">
              <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Error</p>
                <p className="text-xs text-destructive/80 mt-1 font-mono">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {result !== null && !error && (
          <div className="space-y-3 animate-fade-in">
            {/* Result header */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-sm font-medium text-emerald-500">Success</span>
              </div>
              {duration !== null && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock size={11} />
                    {fmtDuration(0, duration)}
                  </div>
                </>
              )}
              <div className="ml-auto">
                <CopyButton text={JSON.stringify(result, null, 2)} />
              </div>
            </div>

            {/* Markdown preview */}
            {(() => {
              const r = result as Record<string, unknown> | null
              const raw = r?.markdown ?? (r?.result as Record<string, unknown> | null)?.markdown
              const md = typeof raw === 'string' ? raw : null
              return md ? (
                <CollapsibleBlock title="Markdown preview">
                  {md}
                </CollapsibleBlock>
              ) : null
            })()}

            {/* Full JSON */}
            <CollapsibleBlock title="JSON response">
              {JSON.stringify(result, null, 2)}
            </CollapsibleBlock>
          </div>
        )}
      </div>
    </div>
  )
}
