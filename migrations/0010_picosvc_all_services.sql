CREATE TABLE IF NOT EXISTS rss_feeds (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_hash TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rss_feeds_owner ON rss_feeds(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_rss_feeds_due ON rss_feeds(enabled, last_checked_at);

CREATE TABLE IF NOT EXISTS rss_entries (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  guid TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rss_entries_feed ON rss_entries(feed_id, published_at DESC);

CREATE TABLE IF NOT EXISTS mail_routes (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_routes_owner ON mail_routes(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_mail_routes_public ON mail_routes(public_id, enabled);

CREATE TABLE IF NOT EXISTS mail_events (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  raw_size INTEGER NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL,
  error TEXT,
  received_at TEXT NOT NULL,
  FOREIGN KEY (route_id) REFERENCES mail_routes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_events_route ON mail_events(route_id, received_at DESC);

CREATE TABLE IF NOT EXISTS qr_links (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  scans INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_links_owner ON qr_links(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_qr_links_public ON qr_links(public_id, enabled);

CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  target_url TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_owner ON cron_jobs(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);

CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  response_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job_id, ran_at DESC);

CREATE TABLE IF NOT EXISTS function_apps (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_function_apps_owner ON function_apps(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_function_apps_public ON function_apps(public_id, enabled);

CREATE TABLE IF NOT EXISTS json_stores (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_json_stores_owner ON json_stores(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_json_stores_public ON json_stores(public_id);

CREATE TABLE IF NOT EXISTS json_documents (
  store_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, key),
  FOREIGN KEY (store_id) REFERENCES json_stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_spaces (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_spaces_owner ON file_spaces(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_file_spaces_public ON file_spaces(public_id, enabled);

CREATE TABLE IF NOT EXISTS file_objects (
  space_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (space_id, path),
  FOREIGN KEY (space_id) REFERENCES file_spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_file_objects_owner ON file_objects(owner, created_at);

CREATE TABLE IF NOT EXISTS license_projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_license_projects_owner ON license_projects(owner, created_at);

CREATE TABLE IF NOT EXISTS license_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES license_projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_license_keys_project ON license_keys(project_id, created_at);

CREATE TABLE IF NOT EXISTS flag_projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flag_projects_owner ON flag_projects(owner, created_at);

CREATE TABLE IF NOT EXISTS feature_flags (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, key),
  FOREIGN KEY (project_id) REFERENCES flag_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  webhook_url TEXT,
  interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 5 AND 10080),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_hash TEXT,
  last_checked_at TEXT,
  last_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitors_owner ON monitors(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(enabled, last_checked_at);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forms_owner ON forms(owner, created_at);
CREATE INDEX IF NOT EXISTS idx_forms_public ON forms(public_id, enabled);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id, received_at DESC);
