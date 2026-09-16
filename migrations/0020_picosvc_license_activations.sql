ALTER TABLE license_keys ADD COLUMN customer_ref TEXT;
ALTER TABLE license_keys ADD COLUMN activation_limit INTEGER CHECK (activation_limit IS NULL OR (activation_limit BETWEEN 1 AND 100));
ALTER TABLE license_keys ADD COLUMN device_binding INTEGER NOT NULL DEFAULT 0 CHECK (device_binding IN (0,1));

CREATE TABLE IF NOT EXISTS license_activations (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (key_id, device_hash),
  FOREIGN KEY (key_id) REFERENCES license_keys(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_license_activations_key ON license_activations(key_id,owner,activated_at);

CREATE TABLE IF NOT EXISTS license_validation_history (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0,1)),
  reason TEXT NOT NULL,
  device_hash TEXT,
  checked_at TEXT NOT NULL,
  FOREIGN KEY (key_id) REFERENCES license_keys(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_license_validation_history_key ON license_validation_history(key_id,owner,checked_at DESC);
