CREATE TABLE IF NOT EXISTS cron_job_options (
  job_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  expected_status INTEGER,
  max_retries INTEGER NOT NULL DEFAULT 2 CHECK(max_retries BETWEEN 0 AND 3),
  notification_url TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cron_options_active ON cron_job_options(active,owner);
CREATE TABLE IF NOT EXISTS cron_dispatch_claims (
  job_id TEXT NOT NULL,
  scheduled_minute TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(job_id,scheduled_minute),
  FOREIGN KEY(job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cron_run_attempts (
  run_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 4),
  response_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  attempted_at TEXT NOT NULL,
  PRIMARY KEY(run_id,attempt),
  FOREIGN KEY(run_id) REFERENCES cron_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cron_attempts_owner ON cron_run_attempts(owner,attempted_at DESC);
CREATE TABLE IF NOT EXISTS cron_notifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  response_status INTEGER,
  error TEXT,
  sent_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES cron_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cron_notifications_owner ON cron_notifications(owner,sent_at DESC);
