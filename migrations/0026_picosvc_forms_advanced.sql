CREATE TABLE IF NOT EXISTS form_options (
  form_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  allowed_origins_json TEXT NOT NULL DEFAULT '[]',
  required_fields_json TEXT NOT NULL DEFAULT '[]',
  honeypot_field TEXT NOT NULL DEFAULT '_website',
  webhook_url TEXT,
  success_redirect TEXT,
  require_turnstile INTEGER NOT NULL DEFAULT 0 CHECK(require_turnstile IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_options_owner ON form_options(owner);
CREATE TABLE IF NOT EXISTS form_deliveries (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  destination TEXT NOT NULL,
  response_status INTEGER,
  error TEXT,
  delivered_at TEXT NOT NULL,
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY(submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_deliveries_form ON form_deliveries(form_id,delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_owner_received ON form_submissions(owner,received_at DESC);