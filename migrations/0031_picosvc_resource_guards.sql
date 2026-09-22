-- Browser work is mutually exclusive per account across Fetch and Shot. Lease expiry
-- recovers from Worker termination without letting a response-only timeout free a slot.
CREATE TABLE IF NOT EXISTS picosvc_browser_leases (
  owner TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  lease_until_ms INTEGER NOT NULL DEFAULT 0,
  next_allowed_ms INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL DEFAULT 0
);

-- Backfill once at migration time. Never rescan every document on each JSON PUT.
-- Counts are per store; owner totals require scanning only the owner's stores.
CREATE TABLE IF NOT EXISTS json_store_usage (
  store_id TEXT PRIMARY KEY REFERENCES json_stores(id) ON DELETE CASCADE,
  documents INTEGER NOT NULL DEFAULT 0 CHECK (documents >= 0),
  bytes INTEGER NOT NULL DEFAULT 0 CHECK (bytes >= 0)
);
INSERT INTO json_store_usage (store_id, documents, bytes)
SELECT s.id, COUNT(d.key), COALESCE(SUM(LENGTH(CAST(d.value_json AS BLOB))), 0)
FROM json_stores AS s
LEFT JOIN json_documents AS d ON d.store_id = s.id
GROUP BY s.id
ON CONFLICT(store_id) DO UPDATE SET documents = excluded.documents, bytes = excluded.bytes;

CREATE TRIGGER IF NOT EXISTS json_usage_store_insert AFTER INSERT ON json_stores
BEGIN
  INSERT OR IGNORE INTO json_store_usage (store_id, documents, bytes) VALUES (NEW.id, 0, 0);
END;
CREATE TRIGGER IF NOT EXISTS json_usage_document_insert AFTER INSERT ON json_documents
BEGIN
  UPDATE json_store_usage SET
    documents = documents + 1,
    bytes = bytes + LENGTH(CAST(NEW.value_json AS BLOB))
  WHERE store_id = NEW.store_id;
END;
CREATE TRIGGER IF NOT EXISTS json_usage_document_update AFTER UPDATE OF value_json ON json_documents
BEGIN
  UPDATE json_store_usage SET
    bytes = bytes + LENGTH(CAST(NEW.value_json AS BLOB)) - LENGTH(CAST(OLD.value_json AS BLOB))
  WHERE store_id = NEW.store_id;
END;
CREATE TRIGGER IF NOT EXISTS json_usage_document_delete AFTER DELETE ON json_documents
BEGIN
  UPDATE json_store_usage SET
    documents = documents - 1,
    bytes = bytes - LENGTH(CAST(OLD.value_json AS BLOB))
  WHERE store_id = OLD.store_id;
END;
-- Moving a document across stores is not supported by the API; prevent it from
-- silently corrupting per-store counters if a future writer attempts it.
CREATE TRIGGER IF NOT EXISTS json_usage_document_no_move BEFORE UPDATE OF store_id ON json_documents
WHEN NEW.store_id <> OLD.store_id
BEGIN
  SELECT RAISE(ABORT, 'Moving JSON documents between stores is not supported');
END;
