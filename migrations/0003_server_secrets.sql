CREATE TABLE IF NOT EXISTS server_secrets (
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (server_id, name),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_secrets_server ON server_secrets(server_id);
