import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { z } from 'zod'
import type { Logger } from 'pino'
import { getConfig } from '../config/loader.js'
import type { AIProviderConfig } from '../types/index.js'

const SYSTEM_PROMPT = `You are a precise web data extraction engine.
You receive raw HTML from a webpage and extract structured data from it.
Return ONLY the JSON object matching the requested schema — no explanations, no markdown, no extra text.
If a field is not found in the HTML, return null for that field.
Always extract as much data as possible from what is visible in the HTML.`

export class AIEngine {
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'AIEngine' })
  }

  isEnabled(): boolean {
    return getConfig().ai_engine.enabled
  }

  private resolveProvider(p: AIProviderConfig) {
    const key = p.api_key ?? ''
    switch (p.name) {
      case 'openai':
        return createOpenAI({ apiKey: key })
      case 'anthropic':
        return createAnthropic({ apiKey: key })
      case 'gemini':
        return createGoogleGenerativeAI({ apiKey: key })
      case 'groq':
        return createGroq({ apiKey: key })
      case 'mistral':
        return createMistral({ apiKey: key })
      case 'deepseek': {
        // DeepSeek is OpenAI-compatible
        return createOpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com/v1' })
      }
      case 'xai': {
        return createOpenAI({ apiKey: key, baseURL: 'https://api.x.ai/v1' })
      }
      case 'ollama': {
        return createOpenAI({
          apiKey: 'ollama',
          baseURL: (p.base_url ?? 'http://localhost:11434') + '/v1',
        })
      }
      default:
        throw new Error(`Unknown AI provider: ${p.name}`)
    }
  }

  private selectProvider(): { provider: ReturnType<typeof createOpenAI>; config: AIProviderConfig } | null {
    const cfg = getConfig()

    for (const p of cfg.ai_engine.providers) {
      if (p.local) {
        // Ollama — always available if running locally
        try {
          return { provider: this.resolveProvider(p) as ReturnType<typeof createOpenAI>, config: p }
        } catch {
          continue
        }
      }
      if (p.api_key && p.api_key.trim()) {
        return { provider: this.resolveProvider(p) as ReturnType<typeof createOpenAI>, config: p }
      }
    }

    return null
  }

  async extract(html: string, extractionSchema: z.ZodTypeAny, hint?: string): Promise<Record<string, unknown> | null> {
    const cfg = getConfig()

    if (!this.isEnabled()) {
      this.logger.debug('AI Engine disabled, skipping')
      return null
    }

    const selected = this.selectProvider()
    if (!selected) {
      this.logger.warn('AI Engine: no provider configured with a valid API key — skipping')
      return null
    }

    const { provider, config: pcfg } = selected

    // Truncate HTML to avoid token overflow
    const truncatedHtml = html.length > cfg.ai_engine.max_html_chars
      ? html.slice(0, cfg.ai_engine.max_html_chars) + '\n<!-- truncated -->'
      : html

    this.logger.info({ provider: pcfg.name, model: pcfg.model, html_chars: truncatedHtml.length }, 'AI extraction started')

    try {
      const model = provider(pcfg.model)

      const { object } = await generateObject({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: model as any,
        schema: extractionSchema,
        system: SYSTEM_PROMPT,
        prompt: `${hint ? `Context: ${hint}\n\n` : ''}Extract structured data from this HTML:\n\n${truncatedHtml}`,
        maxTokens: 4096,
      })

      this.logger.info({ provider: pcfg.name }, 'AI extraction complete')
      return object as Record<string, unknown>

    } catch (err) {
      this.logger.error({ err, provider: pcfg.name }, 'AI extraction failed')
      return null
    }
  }
}

// ─── Common extraction schemas ────────────────────────────────────────────────

export const GenericPageSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  published_at: z.string().nullable(),
  content: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  images: z.array(z.string()).nullable(),
  links: z.array(z.object({ text: z.string(), url: z.string() })).nullable(),
})

export const VideoPageSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  author_id: z.string().nullable(),
  thumbnail: z.string().nullable(),
  duration: z.string().nullable(),
  view_count: z.number().nullable(),
  like_count: z.number().nullable(),
  comment_count: z.number().nullable(),
  published_at: z.string().nullable(),
  hashtags: z.array(z.string()).nullable(),
  comments: z.array(z.object({
    author: z.string(),
    text: z.string(),
    likes: z.number().nullable(),
    published_at: z.string().nullable(),
  })).nullable(),
})

export const ProfilePageSchema = z.object({
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  follower_count: z.number().nullable(),
  following_count: z.number().nullable(),
  post_count: z.number().nullable(),
  verified: z.boolean().nullable(),
  website: z.string().nullable(),
})
