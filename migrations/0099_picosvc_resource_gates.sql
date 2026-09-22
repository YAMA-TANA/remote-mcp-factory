-- Browser leases serialize costly Quick Actions across all isolates for each owner and service.
CREATE TABLE IF NOT EXISTS picosvc_browser_gates (
  owner TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('fetch', 'shot')),
  token TEXT NOT NULL,
  leased_until_ms INTEGER NOT NULL,
  next_allowed_ms INTEGER NOT NULL,
  PRIMARY KEY (owner, product)
);

-- A monthly browser-time budget is independent of the existing request-count quota.
CREATE TABLE IF NOT EXISTS picosvc_browser_usage (
  owner TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('fetch', 'shot')),
  month TEXT NOT NULL,
  used_ms INTEGER NOT NULL DEFAULT 0 CHECK (used_ms >= 0),
  PRIMARY KEY (owner, product, month)
);

-- Backfill once. Subsequent JSON document mutations are accounted for by triggers,
-- so normal PUTs never have to COUNT/SUM every document belonging to an owner.
CREATE TABLE IF NOT EXISTS picosvc_json_totals (
  owner TEXT PRIMARY KEY,
  documents INTEGER NOT NULL DEFAULT 0 CHECK (documents >= 0),
  storage_bytes INTEGER NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0)
);
INSERT OR IGNORE INTO picosvc_json_totals (owner, documents, storage_bytes)
SELECT s.owner, COUNT(d.key), COALESCE(SUM(LENGTH(CAST(d.value_json AS BLOB))), 0)
FROM json_stores s LEFT JOIN json_documents d ON d.store_id = s.id
GROUP BY s.owner;

CREATE TRIGGER IF NOT EXISTS trg_picosvc_json_document_insert
AFTER INSERT ON json_documents
BEGIN
  INSERT INTO picosvc_json_totals (owner, documents, storage_bytes)
  SELECT owner, 1, LENGTH(CAST(NEW.value_json AS BLOB)) FROM json_stores WHERE id = NEW.store_id
  ON CONFLICT(owner) DO UPDATE SET
    documents = documents + 1,
    storage_bytes = storage_bytes + LENGTH(CAST(NEW.value_json AS BLOB));
END;

CREATE TRIGGER IF NOT EXISTS trg_picosvc_json_document_update
AFTER UPDATE OF value_json, store_id ON json_documents
BEGIN
  UPDATE picosvc_json_totals SET
    documents = documents - 1,
    storage_bytes = storage_bytes - LENGTH(CAST(OLD.value_json AS BLOB))
  WHERE owner = (SELECT owner FROM json_stores WHERE id = OLD.store_id);
  INSERT INTO picosvc_json_totals (owner, documents, storage_bytes)
  SELECT owner, 1, LENGTH(CAST(NEW.value_json AS BLOB)) FROM json_stores WHERE id = NEW.store_id
  ON CONFLICT(owner) DO UPDATE SET
    documents = documents + 1,
    storage_bytes = storage_bytes + LENGTH(CAST(NEW.value_json AS BLOB));
END;

CREATE TRIGGER IF NOT EXISTS trg_picosvc_json_document_delete
AFTER DELETE ON json_documents
BEGIN
  UPDATE picosvc_json_totals SET
    documents = documents - 1,
    storage_bytes = storage_bytes - LENGTH(CAST(OLD.value_json AS BLOB))
  WHERE owner = (SELECT owner FROM json_stores WHERE id = OLD.store_id);
END;

-- Parent deletion cascades after the parent disappears. Subtract the store's
-- documents beforehand, when the owner mapping is still available.
CREATE TRIGGER IF NOT EXISTS trg_picosvc_json_store_delete
BEFORE DELETE ON json_stores
BEGIN
  UPDATE picosvc_json_totals SET
    documents = documents - (SELECT COUNT(*) FROM json_documents WHERE store_id = OLD.id),
    storage_bytes = storage_bytes - COALESCE((SELECT SUM(LENGTH(CAST(value_json AS BLOB))) FROM json_documents WHERE store_id = OLD.id), 0)
  WHERE owner = OLD.owner;
END;
