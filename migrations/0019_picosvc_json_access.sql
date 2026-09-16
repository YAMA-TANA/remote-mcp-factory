ALTER TABLE json_stores ADD COLUMN public_read INTEGER NOT NULL DEFAULT 0 CHECK (public_read IN (0,1));

CREATE TABLE IF NOT EXISTS json_store_tokens (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN ('read','write','readwrite')),
  key_prefix TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES json_stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_json_store_tokens_store ON json_store_tokens(store_id,owner,created_at);
