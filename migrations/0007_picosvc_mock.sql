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
