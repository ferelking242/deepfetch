import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { BrowserPool } from '../core/BrowserPool.js'

export async function takeScreenshot(url: string, pool: BrowserPool): Promise<string> {
  const screenshotsDir = path.join(process.cwd(), 'data', 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const filename = `${randomUUID()}.png`
  const filepath = path.join(screenshotsDir, filename)

  const context = await pool.acquire()
  try {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(2000) // let page settle
    await page.screenshot({ path: filepath, fullPage: false })
    await page.close()
  } finally {
    await pool.release(context)
  }

  return filepath
}
