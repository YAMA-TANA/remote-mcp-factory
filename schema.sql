CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  owner_org TEXT,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  subdir TEXT NOT NULL DEFAULT '',
  command TEXT,
  token_hash TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'token' CHECK (visibility IN ('public', 'token')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'queued',
  detected_runtime TEXT,
  detected_command TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner);
CREATE INDEX IF NOT EXISTS idx_servers_visibility ON servers(visibility, status, enabled);

CREATE TABLE IF NOT EXISTS usage_monthly (
  owner TEXT NOT NULL,
  month TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  builds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, month)
);

CREATE TABLE IF NOT EXISTS billing_cache (
  owner TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('hobby', 'pro', 'team')),
  checked_at TEXT NOT NULL
);
