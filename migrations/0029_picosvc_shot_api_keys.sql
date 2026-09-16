-- Screenshot API credentials are scoped to Screenshot only. Store hashes, never plaintext tokens.
CREATE TABLE IF NOT EXISTS shot_api_keys (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shot_api_keys_owner ON shot_api_keys(owner, created_at DESC);
