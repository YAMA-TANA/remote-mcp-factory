ALTER TABLE function_apps ADD COLUMN current_revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS function_revisions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(app_id,revision_no),
  FOREIGN KEY(app_id) REFERENCES function_apps(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_function_revisions_owner ON function_revisions(owner,app_id,revision_no DESC);
INSERT OR IGNORE INTO function_revisions(id,app_id,owner,revision_no,code,created_at)
  SELECT lower(hex(randomblob(16))),id,owner,1,code,updated_at FROM function_apps;
CREATE TABLE IF NOT EXISTS function_secrets (
  app_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(app_id,name),
  FOREIGN KEY(app_id) REFERENCES function_apps(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS function_invocations (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER NOT NULL,
  error TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(app_id) REFERENCES function_apps(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_function_invocations_owner ON function_invocations(owner,app_id,occurred_at DESC);
