#!/usr/bin/env node
  /**
   * DeepFetch MCP Server
   * Exposes scrape_url, crawl_website, batch_scrape, get_job as MCP tools.
   *
   * Config via env vars:
   *   DEEPFETCH_URL            e.g. http://localhost:3000  (default)
   *   DEEPFETCH_API_KEY        API key or master secret
   */
  import { Server } from '@modelcontextprotocol/sdk/server/index.js'
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
  import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
  } from '@modelcontextprotocol/sdk/types.js'

  const BASE = (process.env.DEEPFETCH_URL || 'http://localhost:3000').replace(/\/$/, '')
  const API_KEY = process.env.DEEPFETCH_API_KEY || ''

  async function api(path, body) {
    const opts = {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
      },
    }
    if (body) opts.body = JSON.stringify(body)
    const r = await fetch(BASE + path, opts)
    return r.json()
  }

  const server = new Server(
    { name: 'deepfetch', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'scrape_url',
        description: 'Scrape a web page and return its content as markdown and/or structured JSON. Supports browser actions (fill, click, wait) for interactive pages.',
        inputSchema: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'URL to scrape' },
            output: { type: 'array', items: { type: 'string', enum: ['markdown','json','html','screenshot'] }, default: ['markdown','json'], description: 'Output formats' },
            actions: {
              type: 'array',
              description: 'Browser actions to execute before extracting content (fill forms, click buttons, wait for navigation)',
              items: {
                type: 'object',
                required: ['type'],
                properties: {
                  type: { type: 'string', enum: ['fill','click','wait_for_url','wait_for_selector','select'] },
                  selector: { type: 'string', description: 'CSS selector' },
                  value: { type: 'string', description: 'Value to fill or select' },
                  pattern: { type: 'string', description: 'URL pattern to wait for (glob or regex)' },
                }
              }
            },
            wait_for: { type: 'string', description: 'CSS selector to wait for before extracting' },
            scroll: { type: 'boolean', default: false, description: 'Auto-scroll to load lazy content' },
            timeout_ms: { type: 'number', description: 'Timeout in milliseconds (max 120000)' },
          }
        }
      },
      {
        name: 'crawl_website',
        description: 'Crawl multiple pages starting from a seed URL, following links up to a depth/limit.',
        inputSchema: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'Seed URL to start crawling from' },
            crawl_depth: { type: 'number', default: 2, description: 'Max link depth (1-5)' },
            crawl_limit: { type: 'number', default: 20, description: 'Max pages to crawl' },
            output: { type: 'array', items: { type: 'string' }, default: ['markdown'] },
          }
        }
      },
      {
        name: 'batch_scrape',
        description: 'Scrape multiple URLs in parallel. Returns a job_id for each URL.',
        inputSchema: {
          type: 'object',
          required: ['urls'],
          properties: {
            urls: { type: 'array', items: { type: 'string' }, description: 'List of URLs to scrape' },
            output: { type: 'array', items: { type: 'string' }, default: ['markdown','json'] },
            sync: { type: 'boolean', default: false, description: 'Wait for all results (true) or return job IDs immediately (false)' },
          }
        }
      },
      {
        name: 'get_job',
        description: 'Get the status and result of a previously submitted scrape/crawl job.',
        inputSchema: {
          type: 'object',
          required: ['job_id'],
          properties: {
            job_id: { type: 'string', description: 'Job ID returned by scrape_url (async) or batch_scrape' }
          }
        }
      },
      {
        name: 'health_check',
        description: 'Check DeepFetch server status and resource usage.',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params

    try {
      let result

      if (name === 'scrape_url') {
        result = await api('/v1/scrape', {
          url: args.url,
          sync: true,
          output: args.output || ['markdown', 'json'],
          options: {
            wait_for: args.wait_for,
            scroll: args.scroll || false,
            timeout_ms: args.timeout_ms,
            actions: args.actions,
          }
        })
      } else if (name === 'crawl_website') {
        result = await api('/v1/crawl', {
          url: args.url,
          sync: false,
          output: args.output || ['markdown'],
          options: {
            crawl_depth: args.crawl_depth || 2,
            crawl_limit: args.crawl_limit || 20,
          }
        })
      } else if (name === 'batch_scrape') {
        result = await api('/v1/batch', {
          urls: args.urls,
          sync: args.sync || false,
          output: args.output || ['markdown', 'json'],
        })
      } else if (name === 'get_job') {
        result = await api('/v1/jobs/' + args.job_id)
      } else if (name === 'health_check') {
        result = await api('/v1/health')
      } else {
        return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: 'Error: ' + err.message }],
        isError: true
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  