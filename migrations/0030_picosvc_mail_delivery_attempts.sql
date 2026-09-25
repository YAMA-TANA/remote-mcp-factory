CREATE TABLE IF NOT EXISTS mail_delivery_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  response_status INTEGER,
  duration_ms INTEGER NOT NULL,
  error TEXT,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES mail_events(id) ON DELETE CASCADE,
  FOREIGN KEY(route_id) REFERENCES mail_routes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_delivery_attempts_event
  ON mail_delivery_attempts(event_id,owner,attempt_number);
