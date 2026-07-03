import { useState, useRef } from 'react'
import { scrape, crawl, batch } from '../lib/api.ts'
import { Play, Loader, Copy, Check, ChevronDown, ChevronRight, Zap, Globe, Layers } from 'lucide-react'
import clsx from 'clsx'
import type { ScrapeRequest, CrawlRequest, BatchRequest } from '../lib/api.ts'

type Mode = 'scrape' | 'crawl' | 'batch'
type OutputFmt = 'markdown' | 'json' | 'html' | 'screenshot'

const MODES: { id: Mode; icon: typeof Zap; label: string; desc: string }[] = [
  { id: 'scrape', icon: Zap,    label: 'Scrape',  desc: 'Single URL — text, data, screenshot' },
  { id: 'crawl',  icon: Globe,  label: 'Crawl',   desc: 'Follow links from a starting URL' },
  { id: 'batch',  icon: Layers, label: 'Batch',   desc: 'Multiple URLs in parallel' },
]

function JsonViewer({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(true)
  const text = JSON.stringify(data, null, 2)
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 transition-colors"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        JSON Response
      </button>
      {expanded && (
        <pre className="p-4 text-xs text-gray-300 overflow-auto max-h-96 leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  )
}

function MarkdownViewer({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 transition-colors"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Markdown Output
      </button>
      {expanded && (
        <pre className="p-4 text-xs text-gray-300 overflow-auto max-h-96 leading-relaxed whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded-md hover:bg-gray-800">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-600 transition-colors'
const selectCls = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-cyan-600 transition-colors'

export default function Playground() {
  const [mode, setMode] = useState<Mode>('scrape')
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
  const [crawlPatterns, setCrawlPatterns] = useState('')

  // Batch state
  const [batchUrls, setBatchUrls] = useState('')
  const [batchOutput, setBatchOutput] = useState<OutputFmt[]>(['markdown'])

  const toggleOutput = (fmt: OutputFmt, list: OutputFmt[], setList: (v: OutputFmt[]) => void) => {
    setList(list.includes(fmt) ? list.filter(f => f !== fmt) : [...list, fmt])
  }

  const run = async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    setDuration(null)
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
          try { (body as Record<string, unknown>).actions = JSON.parse(scrapeActions) }
          catch { throw new Error('Actions JSON invalide') }
        }
        res = await scrape(body)
      } else if (mode === 'crawl') {
        const body: CrawlRequest = {
          url: crawlUrl,
          max_depth: crawlDepth,
          max_pages: crawlLimit,
          ...(crawlPatterns.trim() ? { include_patterns: crawlPatterns.split('\n').map(s => s.trim()).filter(Boolean) } : {}),
        }
        res = await crawl(body)
      } else {
        const urls = batchUrls.split('\n').map(s => s.trim()).filter(Boolean)
        if (!urls.length) throw new Error('Entrez au moins une URL')
        const body: BatchRequest = {
          requests: urls.map(url => ({ url, output: batchOutput.length ? batchOutput : ['markdown'] })),
        }
        res = await batch(body)
      }
      setResult(res)
      setDuration(Date.now() - t0)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const canRun = !running && (
    (mode === 'scrape' && scrapeUrl.trim().length > 0) ||
    (mode === 'crawl' && crawlUrl.trim().length > 0) ||
    (mode === 'batch' && batchUrls.trim().length > 0)
  )

  const outputFmts: OutputFmt[] = ['markdown', 'json', 'html', 'screenshot']

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Playground</h1>
          <p className="text-xs text-gray-500 mt-0.5">Tester l'API DeepFetch en direct depuis le dashboard</p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {MODES.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => { setMode(id); setResult(null); setError(null) }}
            className={clsx(
              'flex-1 flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all',
              mode === id
                ? 'bg-cyan-950/40 border-cyan-700 text-cyan-300'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
            )}
          >
            <Icon size={15} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs opacity-70 mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Scrape form */}
      {mode === 'scrape' && (
        <div className="card space-y-4">
          <FieldRow label="URL *">
            <input
              type="url"
              value={scrapeUrl}
              onChange={e => setScrapeUrl(e.target.value)}
              placeholder="https://example.com"
              className={inputCls}
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Mode d'exécution">
              <div className="flex gap-2">
                {(['high', 'normal', 'batch'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setScrapePriority(p)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      scrapePriority === p ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    )}
                  >{p}</button>
                ))}
              </div>
            </FieldRow>
            <FieldRow label="Format de sortie">
              <div className="flex gap-2 flex-wrap">
                {outputFmts.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => toggleOutput(fmt, scrapeOutput, setScrapeOutput)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      scrapeOutput.includes(fmt) ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    )}
                  >{fmt}</button>
                ))}
              </div>
            </FieldRow>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={scrapeSync} onChange={e => setScrapeSync(e.target.checked)} className="accent-cyan-500" />
              Synchrone (attend le résultat)
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={scrapeScroll} onChange={e => setScrapeScroll(e.target.checked)} className="accent-cyan-500" />
              Scroll automatique
            </label>
          </div>

          <FieldRow label="Wait for selector (optionnel)">
            <input
              type="text"
              value={scrapeWaitFor}
              onChange={e => setScrapeWaitFor(e.target.value)}
              placeholder=".content, #app, [data-loaded]"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label='Actions browser JSON (optionnel — fill/click/wait/select)'>
            <textarea
              value={scrapeActions}
              onChange={e => setScrapeActions(e.target.value)}
              rows={3}
              placeholder={`[{"type":"fill","selector":"#search","value":"deepfetch"},{"type":"click","selector":"button[type=submit]"}]`}
              className={clsx(inputCls, 'font-mono text-xs resize-none')}
            />
          </FieldRow>
        </div>
      )}

      {/* Crawl form */}
      {mode === 'crawl' && (
        <div className="card space-y-4">
          <FieldRow label="URL de départ *">
            <input
              type="url"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              placeholder="https://docs.example.com"
              className={inputCls}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Profondeur max">
              <input
                type="number"
                min={1}
                max={10}
                value={crawlDepth}
                onChange={e => setCrawlDepth(Number(e.target.value))}
                className={clsx(inputCls, 'w-24')}
              />
            </FieldRow>
            <FieldRow label="Pages max">
              <input
                type="number"
                min={1}
                max={500}
                value={crawlLimit}
                onChange={e => setCrawlLimit(Number(e.target.value))}
                className={clsx(inputCls, 'w-24')}
              />
            </FieldRow>
          </div>
          <FieldRow label="Patterns d'inclusion (optionnel, une regex par ligne)">
            <textarea
              value={crawlPatterns}
              onChange={e => setCrawlPatterns(e.target.value)}
              rows={3}
              placeholder="/docs/*&#10;/blog/*"
              className={clsx(inputCls, 'font-mono text-xs resize-none')}
            />
          </FieldRow>
        </div>
      )}

      {/* Batch form */}
      {mode === 'batch' && (
        <div className="card space-y-4">
          <FieldRow label="URLs (une par ligne) *">
            <textarea
              value={batchUrls}
              onChange={e => setBatchUrls(e.target.value)}
              rows={6}
              placeholder={`https://example.com\nhttps://github.com/ferelking242/deepfetch\nhttps://news.ycombinator.com`}
              className={clsx(inputCls, 'font-mono text-xs resize-none')}
            />
          </FieldRow>
          <FieldRow label="Format de sortie">
            <div className="flex gap-2 flex-wrap">
              {outputFmts.map(fmt => (
                <button
                  key={fmt}
                  onClick={() => toggleOutput(fmt, batchOutput, setBatchOutput)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    batchOutput.includes(fmt) ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >{fmt}</button>
              ))}
            </div>
          </FieldRow>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={() => void run()}
        disabled={!canRun}
        className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
      >
        {running ? <Loader size={15} className="animate-spin" /> : <Play size={15} />}
        {running ? 'En cours…' : `Lancer ${mode}`}
      </button>

      {/* Results */}
      <div ref={resultRef} className="space-y-3">
        {error && (
          <div className="card border-red-900 bg-red-950/20">
            <p className="text-sm text-red-400 font-medium">Erreur</p>
            <p className="text-xs text-red-300 mt-1 font-mono">{error}</p>
          </div>
        )}

        {result !== null && !error && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm text-green-400 font-medium">Succès</span>
                {duration && <span className="text-xs text-gray-500">· {(duration / 1000).toFixed(2)}s</span>}
              </div>
              <CopyButton text={JSON.stringify(result, null, 2)} />
            </div>

            {/* Markdown preview if available */}
            {(() => {
              const r = result as Record<string, unknown>
              const md = r?.markdown ?? r?.result?.markdown ?? r?.pages?.[0]?.markdown
              if (typeof md === 'string' && md.length > 0) {
                return <MarkdownViewer content={md} />
              }
              return null
            })()}

            <JsonViewer data={result} />
          </div>
        )}
      </div>
    </div>
  )
}
