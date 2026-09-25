-- Dedicated credentials for the built-in PicoSvc management MCP.
-- Store only hashes. The plaintext psm_ token is returned once at creation.
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
