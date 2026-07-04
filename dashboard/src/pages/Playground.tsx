import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { scrape, crawl, batch } from '@/lib/api'
import { MobileNotice } from '@/components/MobileNotice'
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
        'h-9 px-3 rounded-md text-xs font-medium border transition-colors',
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-1.5">
      <label className="text-xs text-muted-foreground font-medium">{children}</label>
      {hint && <span className="text-[10px] text-muted-foreground/60">{hint}</span>}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Button variant="ghost" size="sm" onClick={copy}
      className={cn('h-7 gap-1.5 text-xs', copied ? 'text-emerald-500' : 'text-muted-foreground')}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? t('common.copied') : t('common.copy')}
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
        <span className="font-medium">{title}</span>
      </button>
      {open && (
        <pre className="p-4 text-xs font-mono text-foreground overflow-auto max-h-80 bg-background/50 leading-relaxed whitespace-pre-wrap break-all">
          {children}
        </pre>
      )}
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
      <div className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
        checked ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'
      )} onClick={() => onChange(!checked)}>
        {checked && <Check size={11} className="text-primary-foreground" />}
      </div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>
  )
}

export default function Playground() {
  const { t } = useTranslation()
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
  const [scrapeSessionId, setScrapeSessionId] = useState('')
  const [scrapeTimeout, setScrapeTimeout] = useState('')
  const [scrapeMaxComments, setScrapeMaxComments] = useState('')

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawlDepth, setCrawlDepth] = useState(2)
  const [crawlLimit, setCrawlLimit] = useState(20)
  const [crawlSameDomain, setCrawlSameDomain] = useState(true)
  const [crawlExclude, setCrawlExclude] = useState('')
  const [crawlOutput, setCrawlOutput] = useState<OutputFmt[]>(['markdown'])
  const [crawlPriority, setCrawlPriority] = useState<'high' | 'normal' | 'batch'>('normal')

  // Batch state
  const [batchUrls, setBatchUrls] = useState('')
  const [batchOutput, setBatchOutput] = useState<OutputFmt[]>(['markdown'])
  const [batchPriority, setBatchPriority] = useState<'high' | 'normal' | 'batch'>('batch')
  const [batchSessionId, setBatchSessionId] = useState('')

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
          ...(scrapeSessionId.trim() ? { session_id: scrapeSessionId.trim() } : {}),
          options: {
            ...(scrapeWaitFor ? { wait_for: scrapeWaitFor } : {}),
            ...(scrapeScroll ? { scroll: true } : {}),
            ...(scrapeTimeout ? { timeout_ms: Number(scrapeTimeout) } : {}),
            ...(scrapeMaxComments ? { max_comments: Number(scrapeMaxComments) } : {}),
          },
        }
        if (scrapeActions.trim()) {
          try { body.options = { ...body.options, actions: JSON.parse(scrapeActions) } }
          catch { throw new Error('Actions: invalid JSON') }
        }
        res = await scrape(body)
      } else if (mode === 'crawl') {
        const body: CrawlRequest = {
          url: crawlUrl,
          depth: crawlDepth,
          limit: crawlLimit,
          same_domain: crawlSameDomain,
          priority: crawlPriority,
          output: crawlOutput.length ? crawlOutput : ['markdown'],
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
          ...(batchSessionId.trim() ? { session_id: batchSessionId.trim() } : {}),
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

  const batchUrlCount = batchUrls.split('\n').filter(s => s.trim()).length

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-base font-semibold">{t('playground.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('playground.subtitle')}</p>
      </div>

      <MobileNotice pageKey="playground" message={t('common.mobileNotice')} />

      <Tabs defaultValue="scrape">
        <TabsList className="mb-1 w-full sm:w-auto grid grid-cols-3 sm:flex">
          <TabsTrigger value="scrape" className="gap-1.5 flex-1 sm:flex-none">
            <Zap size={12} /> {t('playground.tabs.scrape')}
          </TabsTrigger>
          <TabsTrigger value="crawl" className="gap-1.5 flex-1 sm:flex-none">
            <Globe size={12} /> {t('playground.tabs.crawl')}
          </TabsTrigger>
          <TabsTrigger value="batch" className="gap-1.5 flex-1 sm:flex-none">
            <Layers size={12} /> {t('playground.tabs.batch')}
          </TabsTrigger>
        </TabsList>

        {/* ─── SCRAPE ─── */}
        <TabsContent value="scrape">
          <Card>
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm">{t('playground.tabs.scrape')}</CardTitle>
              <CardDescription className="text-xs">Extract content, data, or screenshots from any page.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-5">

              {/* URL */}
              <div>
                <FieldLabel>{t('playground.url')} <span className="text-destructive">*</span></FieldLabel>
                <Input type="url" placeholder={t('playground.urlPlaceholder')} value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} className="h-10" />
              </div>

              {/* Output + Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <FieldLabel>{t('playground.output')}</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {OUTPUT_FMTS.map(f => (
                      <ToggleChip key={f} label={f} active={scrapeOutput.includes(f)} onClick={() => toggleFmt(f, scrapeOutput, setScrapeOutput)} />
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>{t('playground.priority')}</FieldLabel>
                  <div className="flex gap-1.5">
                    {(['high', 'normal', 'batch'] as const).map(p => (
                      <ToggleChip key={p} label={p} active={scrapePriority === p} onClick={() => setScrapePriority(p)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                <CheckboxField label={t('playground.sync')} checked={scrapeSync} onChange={setScrapeSync} />
                <CheckboxField label={t('playground.scroll')} checked={scrapeScroll} onChange={setScrapeScroll} />
              </div>

              {/* Optional fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel hint="(optional)">{t('playground.session')}</FieldLabel>
                  <Input placeholder="sess_abc123" value={scrapeSessionId} onChange={e => setScrapeSessionId(e.target.value)} className="h-10 font-mono text-xs" />
                </div>
                <div>
                  <FieldLabel hint="(optional)">{t('playground.maxComments')}</FieldLabel>
                  <Input type="number" min={0} max={500} placeholder="50" value={scrapeMaxComments} onChange={e => setScrapeMaxComments(e.target.value)} className="h-10" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel hint="(optional)">{t('playground.waitFor')}</FieldLabel>
                  <Input placeholder={t('playground.waitForPlaceholder')} value={scrapeWaitFor} onChange={e => setScrapeWaitFor(e.target.value)} className="h-10 font-mono text-xs" />
                </div>
                <div>
                  <FieldLabel hint="ms, optional">Timeout</FieldLabel>
                  <Input type="number" min={1000} max={120000} placeholder="30000" value={scrapeTimeout} onChange={e => setScrapeTimeout(e.target.value)} className="h-10" />
                </div>
              </div>

              <div>
                <FieldLabel hint={`(optional — ${t('playground.actionsHint')})`}>{t('playground.actions')}</FieldLabel>
                <Textarea
                  rows={3}
                  placeholder={t('playground.actionsPlaceholder')}
                  value={scrapeActions}
                  onChange={e => setScrapeActions(e.target.value)}
                  className="font-mono text-xs resize-y"
                />
              </div>

              <Button onClick={() => void run('scrape')} disabled={running || !scrapeUrl.trim()} className="gap-2 h-10 w-full sm:w-auto">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? t('playground.running') : `${t('playground.run')} scrape`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CRAWL ─── */}
        <TabsContent value="crawl">
          <Card>
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm">{t('playground.tabs.crawl')}</CardTitle>
              <CardDescription className="text-xs">Follow links from a seed URL and scrape multiple pages.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-5">
              <div>
                <FieldLabel>Seed {t('playground.url')} <span className="text-destructive">*</span></FieldLabel>
                <Input type="url" placeholder="https://docs.example.com" value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)} className="h-10" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <FieldLabel>{t('playground.depth')}</FieldLabel>
                  <Input type="number" min={1} max={5} value={crawlDepth} onChange={e => setCrawlDepth(Number(e.target.value))} className="h-10" />
                </div>
                <div>
                  <FieldLabel>{t('playground.limit')}</FieldLabel>
                  <Input type="number" min={1} max={1000} value={crawlLimit} onChange={e => setCrawlLimit(Number(e.target.value))} className="h-10" />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <FieldLabel>{t('playground.priority')}</FieldLabel>
                  <div className="flex gap-1.5">
                    {(['high', 'normal', 'batch'] as const).map(p => (
                      <ToggleChip key={p} label={p} active={crawlPriority === p} onClick={() => setCrawlPriority(p)} />
                    ))}
                  </div>
                </div>
              </div>

              <CheckboxField label={t('playground.sameDomain')} checked={crawlSameDomain} onChange={setCrawlSameDomain} />

              <div>
                <FieldLabel>{t('playground.output')}</FieldLabel>
                <div className="flex gap-1.5 flex-wrap">
                  {OUTPUT_FMTS.filter(f => f !== 'screenshot').map(f => (
                    <ToggleChip key={f} label={f} active={crawlOutput.includes(f)} onClick={() => toggleFmt(f, crawlOutput, setCrawlOutput)} />
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel hint="(optional)">{t('playground.excludePatterns')}</FieldLabel>
                <Textarea rows={3} placeholder={"/login\n/logout\n/admin"} value={crawlExclude} onChange={e => setCrawlExclude(e.target.value)} className="font-mono text-xs resize-y" />
              </div>

              <Button onClick={() => void run('crawl')} disabled={running || !crawlUrl.trim()} className="gap-2 h-10 w-full sm:w-auto">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? t('playground.running') : `${t('playground.run')} crawl`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BATCH ─── */}
        <TabsContent value="batch">
          <Card>
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm">{t('playground.tabs.batch')}</CardTitle>
              <CardDescription className="text-xs">Scrape multiple URLs in parallel. One URL per line.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-5">
              <div>
                <FieldLabel>{t('playground.urls')} <span className="text-destructive">*</span></FieldLabel>
                <Textarea
                  rows={7}
                  placeholder={"https://github.com/ferelking242/deepfetch\nhttps://news.ycombinator.com\nhttps://example.com"}
                  value={batchUrls}
                  onChange={e => setBatchUrls(e.target.value)}
                  className="font-mono text-xs resize-y"
                />
                {batchUrlCount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">{batchUrlCount} URL{batchUrlCount !== 1 ? 's' : ''} detected</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <FieldLabel>{t('playground.priority')}</FieldLabel>
                  <div className="flex gap-1.5">
                    {(['high', 'normal', 'batch'] as const).map(p => (
                      <ToggleChip key={p} label={p} active={batchPriority === p} onClick={() => setBatchPriority(p)} />
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>{t('playground.output')}</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {OUTPUT_FMTS.filter(f => f !== 'screenshot').map(f => (
                      <ToggleChip key={f} label={f} active={batchOutput.includes(f)} onClick={() => toggleFmt(f, batchOutput, setBatchOutput)} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel hint="(optional)">{t('playground.session')}</FieldLabel>
                <Input placeholder="sess_abc123" value={batchSessionId} onChange={e => setBatchSessionId(e.target.value)} className="h-10 font-mono text-xs" />
              </div>

              <Button onClick={() => void run('batch')} disabled={running || !batchUrls.trim()} className="gap-2 h-10 w-full sm:w-auto">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running
                  ? t('playground.running')
                  : `${t('playground.tabs.batch')} (${batchUrlCount} URL${batchUrlCount !== 1 ? 's' : ''})`}
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
                <p className="text-sm font-medium text-destructive">{t('common.error')}</p>
                <p className="text-xs text-destructive/80 mt-1 font-mono break-all">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {result !== null && !error && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-sm font-medium text-emerald-500">Success</span>
              </div>
              {duration !== null && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock size={11} /> {fmtDuration(0, duration)}
                  </div>
                </>
              )}
              {(() => {
                const r = result as Record<string, unknown> | null
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r?.platform && typeof r.platform === 'string' && (
                      <Badge variant="outline" className="text-[10px] font-mono capitalize">{r.platform}</Badge>
                    )}
                    {r?.extracted_by && typeof r.extracted_by === 'string' && (
                      <Badge variant="secondary" className="text-[10px]">{String(r.extracted_by)}</Badge>
                    )}
                    {r?.job_id && typeof r.job_id === 'string' && (
                      <span className="text-[10px] font-mono text-muted-foreground">job:{(r.job_id as string).slice(0, 8)}</span>
                    )}
                  </div>
                )
              })()}
              <div className="ml-auto"><CopyButton text={JSON.stringify(result, null, 2)} /></div>
            </div>

            {(() => {
              const r = result as Record<string, unknown> | null
              const raw = r?.markdown ?? (r?.result as Record<string, unknown> | null)?.markdown
              const md = typeof raw === 'string' ? raw : null
              return md ? <CollapsibleBlock title="Markdown preview">{md}</CollapsibleBlock> : null
            })()}

            <CollapsibleBlock title="JSON response">{JSON.stringify(result, null, 2)}</CollapsibleBlock>
          </div>
        )}

        {result === null && !error && !running && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Play size={28} className="opacity-10" />
            <p className="text-sm">{t('playground.noResult')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
