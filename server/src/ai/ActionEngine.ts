/**
 * ActionEngine — Stagehand-inspired AI browser automation.
 *
 * act(page, instruction)     → NL instruction → CSS selector + playwright action
 * extract(page, instruction, schema) → structured data from current page
 * observe(page)              → list of interactive elements with descriptions
 *
 * All backed by AIEngine (Vercel AI SDK, any provider).
 * act() results are optionally cached via ActionCache.
 */

import type { Page } from 'playwright'
import type { Logger } from 'pino'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { AIEngine } from './AIEngine.js'
import { ActionCache, type CachedAction } from './ActionCache.js'

// ── Page DOM snapshot ──────────────────────────────────────────────────────────

/** Extract a minimal interactive-element tree from the page for the LLM. */
async function getInteractiveSnapshot(page: Page): Promise<string> {
  const elements = await page.evaluate(() => {
    const sel = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
    return Array.from(document.querySelectorAll(sel))
      .filter(el => {
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetParent !== null
      })
      .slice(0, 80)
      .map((el, i) => {
        const tag = el.tagName.toLowerCase()
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''
        const type = el.getAttribute('type') ?? ''
        const name = el.getAttribute('name') ?? ''
        const placeholder = el.getAttribute('placeholder') ?? ''
        const href = el.getAttribute('href') ?? ''
        const ariaLabel = el.getAttribute('aria-label') ?? ''
        const role = el.getAttribute('role') ?? ''
        return `[${i}] <${tag}${type ? ` type="${type}"` : ''}${id}${cls}${name ? ` name="${name}"` : ''}${placeholder ? ` placeholder="${placeholder}"` : ''}${href ? ` href="${href.slice(0, 60)}"` : ''}${ariaLabel ? ` aria-label="${ariaLabel}"` : ''}${role ? ` role="${role}"` : ''}> ${text}`
      })
  })
  return elements.join('\n')
}

/** Extract full page text (truncated) for extraction tasks. */
async function getPageText(page: Page, maxChars = 40_000): Promise<string> {
  const text = await page.evaluate(() => document.body.innerText ?? document.body.textContent ?? '')
  return text.slice(0, maxChars)
}

/** Get page HTML (truncated). */
async function getPageHtml(page: Page, maxChars = 60_000): Promise<string> {
  const html = await page.content()
  return html.slice(0, maxChars)
}

// ── Response schemas ───────────────────────────────────────────────────────────

const ActResultSchema = z.object({
  selector: z.string().describe('CSS selector of the target element. Use the most specific stable selector.'),
  action_type: z.enum(['click', 'fill', 'select', 'check', 'uncheck', 'hover', 'press', 'clear']),
  value: z.string().nullable().describe('Value to type/fill/select, null for click/check/hover'),
  reasoning: z.string().describe('Brief explanation of why this element was chosen'),
  confidence: z.number().min(0).max(1).describe('Confidence in the selection (0-1)'),
})

const ObserveResultSchema = z.object({
  elements: z.array(z.object({
    index: z.number(),
    selector: z.string(),
    description: z.string().describe('What this element is'),
    action: z.enum(['click', 'fill', 'select', 'hover', 'press']),
    value_hint: z.string().nullable().describe('Expected value format for fill/select, null for click'),
  })),
  page_purpose: z.string().describe('What this page appears to be for'),
  current_url: z.string().optional(),
})

// ── ActionEngine ───────────────────────────────────────────────────────────────

export class ActionEngine {
  private readonly ai: AIEngine
  private readonly cache: ActionCache
  private readonly logger: Logger

  constructor(ai: AIEngine, logger: Logger) {
    this.ai = ai
    this.cache = new ActionCache()
    this.logger = logger.child({ component: 'ActionEngine' })
  }

  /**
   * act() — Execute a natural-language instruction on the current page.
   * Returns the resolved action (selector + type + value) and whether it was cached.
   */
  async act(
    page: Page,
    instruction: string,
    opts: { useCache?: boolean; sessionHint?: string } = {}
  ): Promise<{ success: boolean; selector: string; action_type: string; value: string | null; cached: boolean; reasoning: string }> {
    const { useCache = true } = opts
    const hostname = new URL(page.url()).hostname

    // ── 1. Check cache ────────────────────────────────────────────────────────
    if (useCache) {
      const cached = this.cache.get(hostname, instruction)
      if (cached) {
        this.logger.info({ hostname, instruction: instruction.slice(0, 60), selector: cached.selector }, 'ActionCache hit — skipping LLM')
        await this.executeAct(page, cached)
        return { success: true, ...cached, cached: true, reasoning: 'from cache' }
      }
    }

    // ── 2. Ask LLM ────────────────────────────────────────────────────────────
    const snapshot = await getInteractiveSnapshot(page)
    const url = page.url()

    const selected = (this.ai as unknown as { selectProvider: () => { provider: unknown; config: { name: string; model: string } } | null }).selectProvider()
    if (!selected) throw new Error('No AI provider configured. Add an API key in config.yaml → ai_engine.providers.')

    const { provider, config: pcfg } = selected
    const model = (provider as (m: string) => unknown)(pcfg.model)

    const { object } = await generateObject({
      model: model as Parameters<typeof generateObject>[0]['model'],
      schema: ActResultSchema,
      system: `You are a browser automation engine. Given a page's interactive elements, identify the best element and action to fulfill the user's instruction.
Always prefer specific, stable CSS selectors (ID > data attributes > unique class names > text-based locators).
Never use positional selectors like :nth-child unless absolutely necessary.`,
      prompt: `Page URL: ${url}
User instruction: "${instruction}"

Interactive elements on the page:
${snapshot}

${opts.sessionHint ? `Context: ${opts.sessionHint}` : ''}

Select the element and action that best fulfills the instruction.`,
      maxTokens: 1024,
    })

    this.logger.info({ selector: object.selector, action: object.action_type, confidence: object.confidence }, 'ActionEngine.act resolved')

    // ── 3. Execute ────────────────────────────────────────────────────────────
    const action: CachedAction = {
      selector: object.selector,
      action_type: object.action_type,
      value: object.value,
    }

    try {
      await this.executeAct(page, action)
    } catch (err) {
      // Try fallback: search by text if selector fails
      this.logger.warn({ err, selector: object.selector }, 'Primary selector failed — trying text fallback')
      if (object.action_type === 'click') {
        const reasoning = object.reasoning.toLowerCase()
        const textMatch = reasoning.match(/"([^"]+)"/)
        if (textMatch) {
          await page.getByText(textMatch[1], { exact: false }).first().click({ timeout: 5000 }).catch(() => null)
        }
      }
    }

    // ── 4. Cache result ───────────────────────────────────────────────────────
    if (useCache && object.confidence > 0.6) {
      this.cache.set(hostname, instruction, action)
    }

    return {
      success: true,
      selector: object.selector,
      action_type: object.action_type,
      value: object.value,
      cached: false,
      reasoning: object.reasoning,
    }
  }

  private async executeAct(page: Page, action: CachedAction): Promise<void> {
    const loc = page.locator(action.selector).first()
    switch (action.action_type) {
      case 'click':   await loc.click({ timeout: 10_000 }); break
      case 'fill':    await loc.fill(action.value ?? '', { timeout: 10_000 }); break
      case 'select':  await page.selectOption(action.selector, action.value ?? ''); break
      case 'check':   await loc.check({ timeout: 10_000 }); break
      case 'uncheck': await loc.uncheck({ timeout: 10_000 }); break
      case 'hover':   await loc.hover({ timeout: 10_000 }); break
      case 'clear':   await loc.fill(''); break
      case 'press':   await page.keyboard.press(action.value ?? 'Enter'); break
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => null)
  }

  /**
   * extract() — Extract structured data from the current page using a JSON schema.
   * Schema format: standard JSON Schema object (type, properties, description).
   */
  async extract(
    page: Page,
    instruction: string,
    jsonSchema?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const html = await getPageHtml(page)
    const url = page.url()

    // Build Zod schema from JSON schema input (or use a generic one)
    let zodSchema: z.ZodTypeAny
    if (jsonSchema && jsonSchema.properties && typeof jsonSchema.properties === 'object') {
      const props: Record<string, z.ZodTypeAny> = {}
      for (const [key, def] of Object.entries(jsonSchema.properties as Record<string, { type?: string; description?: string; items?: { type?: string } }>)) {
        const desc = def.description ?? key
        switch (def.type) {
          case 'number':  props[key] = z.number().nullable().describe(desc); break
          case 'boolean': props[key] = z.boolean().nullable().describe(desc); break
          case 'array':
            props[key] = z.array(def.items?.type === 'number' ? z.number() : z.string()).nullable().describe(desc); break
          default:        props[key] = z.string().nullable().describe(desc)
        }
      }
      zodSchema = z.object(props)
    } else {
      // Generic extraction schema
      zodSchema = z.object({
        title: z.string().nullable().describe('Page or content title'),
        content: z.string().nullable().describe('Main content text'),
        data: z.record(z.unknown()).nullable().describe('Any structured data found'),
      })
    }

    return this.ai.extract(html, zodSchema, `${instruction}\nURL: ${url}`)
  }

  /**
   * observe() — Analyze current page and return all interactive elements.
   */
  async observe(page: Page): Promise<{
    page_purpose: string
    elements: Array<{ index: number; selector: string; description: string; action: string; value_hint: string | null }>
    url: string
  }> {
    const snapshot = await getInteractiveSnapshot(page)
    const url = page.url()

    const selected = (this.ai as unknown as { selectProvider: () => { provider: unknown; config: { name: string; model: string } } | null }).selectProvider()
    if (!selected) {
      // Fallback: parse snapshot without AI
      const elements = snapshot.split('\n').map((line, i) => ({
        index: i,
        selector: line.match(/\[(\d+)\]/)?.[1] ? `*:nth-child(${i + 1})` : `element-${i}`,
        description: line.slice(line.indexOf('>') + 1).trim().slice(0, 80) || `Element ${i}`,
        action: 'click',
        value_hint: null,
      }))
      return { page_purpose: 'Unknown (no AI configured)', elements, url }
    }

    const { provider, config: pcfg } = selected
    const model = (provider as (m: string) => unknown)(pcfg.model)

    const { object } = await generateObject({
      model: model as Parameters<typeof generateObject>[0]['model'],
      schema: ObserveResultSchema,
      system: 'You are a browser automation assistant. Analyze interactive elements on a web page and describe what actions are available.',
      prompt: `Page URL: ${url}\n\nInteractive elements:\n${snapshot}\n\nDescribe each element and what action it enables. Generate specific CSS selectors for each.`,
      maxTokens: 2048,
    })

    return {
      page_purpose: object.page_purpose,
      elements: object.elements,
      url,
    }
  }

  get actionCache(): ActionCache { return this.cache }
}
