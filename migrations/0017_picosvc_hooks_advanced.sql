ALTER TABLE webhook_inboxes ADD COLUMN forward_url TEXT;
ALTER TABLE webhook_inboxes ADD COLUMN response_status INTEGER;
ALTER TABLE webhook_inboxes ADD COLUMN response_headers_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE webhook_inboxes ADD COLUMN response_body TEXT;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  inbox_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('forward','replay')),
  target_url TEXT NOT NULL,
  response_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES webhook_events(id) ON DELETE CASCADE,
  FOREIGN KEY (inbox_id) REFERENCES webhook_inboxes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_owner ON webhook_deliveries(owner, created_at DESC);
