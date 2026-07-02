import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = process.env.DEEPFETCH_DB_PATH ?? path.join(process.cwd(), 'data', 'deepfetch.db')

  // Ensure data directory exists
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  // Apply schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
  _db.exec(schema)

  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
