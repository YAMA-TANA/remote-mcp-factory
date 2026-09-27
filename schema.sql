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
  updated_at TEXT NOT NULL,
  github_installation_id INTEGER,
  github_repo_id INTEGER,
  github_repo_full_name TEXT,
  auto_deploy INTEGER NOT NULL DEFAULT 0 CHECK (auto_deploy IN (0, 1)),
  redeploy_pending INTEGER NOT NULL DEFAULT 0 CHECK (redeploy_pending IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner);
CREATE INDEX IF NOT EXISTS idx_servers_visibility ON servers(visibility, status, enabled);
CREATE INDEX IF NOT EXISTS idx_servers_github_source ON servers(github_installation_id, github_repo_id, branch, auto_deploy);

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

CREATE TABLE IF NOT EXISTS edge_builds (
  server_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'incompatible')),
  compiler_version TEXT NOT NULL,
  bundle_hash TEXT,
  bundle TEXT,
  artifact_key TEXT,
  main_module TEXT,
  module_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  tool_count INTEGER NOT NULL DEFAULT 0,
  tools_json TEXT NOT NULL DEFAULT '[]',
  compatibility_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edge_builds_status ON edge_builds(status);

CREATE TABLE IF NOT EXISTS server_secrets (
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (server_id, name),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_secrets_server ON server_secrets(server_id);

CREATE TABLE IF NOT EXISTS picosvc_mcp_keys (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  owner_org TEXT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '["read"]',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_picosvc_mcp_keys_owner
  ON picosvc_mcp_keys(owner, created_at DESC);

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

CREATE TABLE IF NOT EXISTS product_entitlements (
  owner TEXT NOT NULL,
  product TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tiny', 'pro')),
  source TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, product)
);

CREATE INDEX IF NOT EXISTS idx_product_entitlements_owner_active
  ON product_entitlements(owner, active);

CREATE TABLE IF NOT EXISTS bundle_entitlements (
  owner TEXT NOT NULL,
  bundle TEXT NOT NULL,
  product TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tiny', 'pro')),
  source TEXT NOT NULL DEFAULT 'billing',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, bundle, product)
);

CREATE INDEX IF NOT EXISTS idx_bundle_entitlements_owner_active
  ON bundle_entitlements(owner, active);
CREATE INDEX IF NOT EXISTS idx_bundle_entitlements_owner_product
  ON bundle_entitlements(owner, product, active);

CREATE TABLE IF NOT EXISTS product_usage_monthly (
  owner TEXT NOT NULL,
  product TEXT NOT NULL,
  metric TEXT NOT NULL,
  month TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, product, metric, month)
);

CREATE INDEX IF NOT EXISTS idx_product_usage_owner_month
  ON product_usage_monthly(owner, month);

CREATE TABLE IF NOT EXISTS mock_endpoints (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD')),
  path TEXT NOT NULL DEFAULT '',
  status_code INTEGER NOT NULL DEFAULT 200 CHECK (status_code BETWEEN 100 AND 599),
  content_type TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  headers_json TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mock_endpoints_owner ON mock_endpoints(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_mock_endpoints_public ON mock_endpoints(public_id, enabled);

CREATE TABLE IF NOT EXISTS webhook_inboxes (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_inboxes_owner ON webhook_inboxes(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_inboxes_public ON webhook_inboxes(public_id, enabled);

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

CREATE INDEX IF NOT EXISTS idx_webhook_events_inbox_received ON webhook_events(inbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_owner_received ON webhook_events(owner, received_at DESC);
