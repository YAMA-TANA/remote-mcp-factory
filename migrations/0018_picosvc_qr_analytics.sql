CREATE TABLE IF NOT EXISTS qr_scan_daily (
  link_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  day TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'unknown',
  device TEXT NOT NULL DEFAULT 'unknown',
  referrer TEXT NOT NULL DEFAULT 'direct',
  scans INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (link_id, day, country, device, referrer),
  FOREIGN KEY (link_id) REFERENCES qr_links(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_qr_scan_daily_owner_day ON qr_scan_daily(owner, day DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scan_daily_link_day ON qr_scan_daily(link_id, day DESC);
