CREATE TABLE IF NOT EXISTS webhook_inboxes (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_inboxes_owner
  ON webhook_inboxes(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_inboxes_public
  ON webhook_inboxes(public_id, enabled);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  query_json TEXT NOT NULL DEFAULT '{}',
  headers_json TEXT NOT NULL DEFAULT '{}',
  content_type TEXT,
  body_base64 TEXT NOT NULL DEFAULT '',
  body_preview TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  FOREIGN KEY (inbox_id) REFERENCES webhook_inboxes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_inbox_received
  ON webhook_events(inbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_owner_received
  ON webhook_events(owner, received_at DESC);
