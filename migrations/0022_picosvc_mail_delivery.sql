ALTER TABLE mail_routes ADD COLUMN signing_iv TEXT;
ALTER TABLE mail_routes ADD COLUMN signing_ciphertext TEXT;
ALTER TABLE mail_events ADD COLUMN payload_r2_key TEXT;
ALTER TABLE mail_events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_events ADD COLUMN next_retry_at TEXT;
ALTER TABLE mail_events ADD COLUMN response_status INTEGER;
ALTER TABLE mail_events ADD COLUMN text_preview TEXT;
ALTER TABLE mail_events ADD COLUMN html_preview TEXT;
CREATE INDEX IF NOT EXISTS idx_mail_events_retry ON mail_events(delivery_status,next_retry_at) WHERE delivery_status IN ('pending','retry');
CREATE TABLE IF NOT EXISTS mail_attachments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES mail_events(id) ON DELETE CASCADE,
  FOREIGN KEY(route_id) REFERENCES mail_routes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_event ON mail_attachments(event_id);
