ALTER TABLE webhook_events ADD COLUMN body_r2_key TEXT;

CREATE INDEX IF NOT EXISTS idx_webhook_events_r2_key
  ON webhook_events(body_r2_key)
  WHERE body_r2_key IS NOT NULL;
