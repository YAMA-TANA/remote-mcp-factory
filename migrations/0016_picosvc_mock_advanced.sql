CREATE TABLE IF NOT EXISTS mock_rules (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  name TEXT NOT NULL,
  method TEXT,
  path_glob TEXT,
  query_json TEXT NOT NULL DEFAULT '{}',
  match_headers_json TEXT NOT NULL DEFAULT '{}',
  body_contains TEXT,
  status_code INTEGER NOT NULL DEFAULT 200,
  content_type TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  response_headers_json TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '',
  delay_ms INTEGER NOT NULL DEFAULT 0,
  failure_percent REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (endpoint_id) REFERENCES mock_endpoints(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mock_rules_endpoint_priority ON mock_rules(endpoint_id, enabled, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_mock_rules_owner ON mock_rules(owner, created_at);

CREATE TABLE IF NOT EXISTS mock_requests (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  rule_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_json TEXT NOT NULL DEFAULT '[]',
  headers_json TEXT NOT NULL DEFAULT '{}',
  body_preview TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (endpoint_id) REFERENCES mock_endpoints(id) ON DELETE CASCADE,
  FOREIGN KEY (rule_id) REFERENCES mock_rules(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mock_requests_endpoint_received ON mock_requests(endpoint_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_requests_owner_received ON mock_requests(owner, received_at DESC);
