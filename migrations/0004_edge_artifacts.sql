ALTER TABLE edge_builds ADD COLUMN artifact_key TEXT;
ALTER TABLE edge_builds ADD COLUMN main_module TEXT;
ALTER TABLE edge_builds ADD COLUMN module_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE edge_builds ADD COLUMN compatibility_json TEXT NOT NULL DEFAULT '{}';
