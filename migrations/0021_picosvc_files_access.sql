-- Existing spaces remain public for backward compatibility. New spaces may opt into private delivery.
ALTER TABLE file_spaces ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'public' CHECK(access_mode IN ('public','private'));
ALTER TABLE file_objects ADD COLUMN cache_control TEXT NOT NULL DEFAULT 'public, max-age=300';
