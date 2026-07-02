import TurndownService from 'turndown'
import type { ScrapeResult } from '../types/index.js'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

export function toMarkdown(result: ScrapeResult): string {
  const d = result.data
  const lines: string[] = []

  lines.push(`# ${d['title'] ?? d['name'] ?? result.url}`)
  lines.push('')

  if (d['author'] ?? d['uploader'] ?? d['channel']) {
    lines.push(`**Author:** ${d['author'] ?? d['uploader'] ?? d['channel']}`)
  }
  if (d['published_at'] ?? d['upload_date'] ?? d['created_utc']) {
    lines.push(`**Published:** ${d['published_at'] ?? d['upload_date'] ?? d['created_utc']}`)
  }
  if (d['view_count']) lines.push(`**Views:** ${(d['view_count'] as number).toLocaleString()}`)
  if (d['like_count']) lines.push(`**Likes:** ${(d['like_count'] as number).toLocaleString()}`)
  if (d['comment_count']) lines.push(`**Comments:** ${(d['comment_count'] as number).toLocaleString()}`)
  if (d['duration_string'] ?? d['duration']) {
    lines.push(`**Duration:** ${d['duration_string'] ?? d['duration']}`)
  }

  lines.push('')

  if (d['description'] ?? d['selftext'] ?? d['content']) {
    const raw = (d['description'] ?? d['selftext'] ?? d['content']) as string
    lines.push('## Description')
    lines.push('')
    // Convert HTML to markdown if needed, else use raw
    const converted = raw.startsWith('<') ? td.turndown(raw) : raw
    lines.push(converted)
    lines.push('')
  }

  if (Array.isArray(d['tags']) && (d['tags'] as string[]).length > 0) {
    lines.push(`**Tags:** ${(d['tags'] as string[]).join(', ')}`)
    lines.push('')
  }

  if (Array.isArray(d['comments']) && (d['comments'] as unknown[]).length > 0) {
    lines.push('## Comments')
    lines.push('')
    for (const c of d['comments'] as Record<string, unknown>[]) {
      lines.push(`**${c['author'] ?? c['username'] ?? 'Anonymous'}**`)
      lines.push(String(c['text'] ?? c['body'] ?? ''))
      if (c['likes'] ?? c['score']) lines.push(`*${c['likes'] ?? c['score']} likes*`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(`*Extracted by DeepFetch · ${result.extracted_by} · ${result.duration_ms}ms*`)

  return lines.join('\n')
}
