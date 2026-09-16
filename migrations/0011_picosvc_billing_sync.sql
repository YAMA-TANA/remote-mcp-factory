CREATE TABLE IF NOT EXISTS billing_sync_state (
  owner TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
