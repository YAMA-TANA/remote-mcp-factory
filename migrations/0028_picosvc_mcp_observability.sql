CREATE TABLE IF NOT EXISTS mcp_runtime_events (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('build','runtime')),
  status TEXT NOT NULL,
  http_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mcp_runtime_events_server ON mcp_runtime_events(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_runtime_events_owner ON mcp_runtime_events(owner, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_request_daily (
  server_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (server_id, day),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mcp_request_daily_owner ON mcp_request_daily(owner, day DESC);
