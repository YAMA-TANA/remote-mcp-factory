CREATE TABLE IF NOT EXISTS edge_builds (
  server_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'incompatible')),
  compiler_version TEXT NOT NULL,
  bundle_hash TEXT,
  bundle TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  tool_count INTEGER NOT NULL DEFAULT 0,
  tools_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edge_builds_status ON edge_builds(status);
