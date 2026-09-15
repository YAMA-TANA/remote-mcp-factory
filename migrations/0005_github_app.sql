ALTER TABLE servers ADD COLUMN github_installation_id INTEGER;
ALTER TABLE servers ADD COLUMN github_repo_id INTEGER;
ALTER TABLE servers ADD COLUMN github_repo_full_name TEXT;
ALTER TABLE servers ADD COLUMN auto_deploy INTEGER NOT NULL DEFAULT 0 CHECK (auto_deploy IN (0, 1));
ALTER TABLE servers ADD COLUMN redeploy_pending INTEGER NOT NULL DEFAULT 0 CHECK (redeploy_pending IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_servers_github_source ON servers(github_installation_id, github_repo_id, branch, auto_deploy);

CREATE TABLE IF NOT EXISTS github_installations (
  owner TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  repository_selection TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_github_installations_id ON github_installations(installation_id, active);

CREATE TABLE IF NOT EXISTS github_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_states_expiry ON github_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);