-- DeepFetch Database Schema
-- SQLite, managed by better-sqlite3

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Jobs ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'generic',
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK(status IN ('queued','running','done','failed','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'normal'
               CHECK(priority IN ('high','normal','batch')),
  session_id   TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  options_json TEXT NOT NULL DEFAULT '{}',
  result_json  TEXT,
  error        TEXT,
  retries      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  finished_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_status    ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority  ON jobs(priority, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created   ON jobs(created_at);

-- ─── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL,
  label           TEXT NOT NULL,
  cookies_enc     TEXT NOT NULL DEFAULT '[]',  -- AES-256-GCM encrypted JSON
  credentials_enc TEXT,                         -- AES-256-GCM encrypted JSON
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active','expired','invalid')),
  last_checked    INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(platform, status);

-- ─── API Keys ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id                    TEXT PRIMARY KEY,
  key_hash              TEXT NOT NULL UNIQUE,  -- SHA-256 of the raw key
  label                 TEXT NOT NULL,
  scopes                TEXT NOT NULL DEFAULT '*',  -- comma-separated: scrape,crawl,read,admin,* 
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  expires_at            INTEGER,               -- NULL = never expires
  created_at            INTEGER NOT NULL,
  last_used             INTEGER
);

-- Migrate: add scopes column if upgrading from old schema
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);

-- ─── Audit Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  key_id     TEXT,
  action     TEXT NOT NULL,
  target_id  TEXT,
  detail     TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
