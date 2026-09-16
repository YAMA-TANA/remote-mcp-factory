CREATE TABLE IF NOT EXISTS mcp_sandbox_active_minutes (
  owner TEXT NOT NULL,
  server_id TEXT NOT NULL,
  active_minute TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner, server_id, active_minute),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_sandbox_minutes_owner_minute
  ON mcp_sandbox_active_minutes(owner, active_minute);
