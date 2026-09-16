CREATE TABLE IF NOT EXISTS monitor_options (
  monitor_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  content_selector TEXT,
  ignore_selector TEXT,
  strip_pattern TEXT,
  last_content_hash TEXT,
  last_text TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monitor_options_due ON monitor_options(enabled,last_checked_at);
CREATE TABLE IF NOT EXISTS monitor_events (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('change','fetch_error')),
  old_hash TEXT,
  new_hash TEXT,
  diff_text TEXT,
  error TEXT,
  webhook_status INTEGER,
  webhook_error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monitor_events_recent ON monitor_events(monitor_id,created_at DESC);