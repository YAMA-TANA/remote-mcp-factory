CREATE TABLE IF NOT EXISTS product_entitlements (
  owner TEXT NOT NULL,
  product TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tiny', 'pro')),
  source TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, product)
);

CREATE INDEX IF NOT EXISTS idx_product_entitlements_owner_active
  ON product_entitlements(owner, active);

CREATE TABLE IF NOT EXISTS product_usage_monthly (
  owner TEXT NOT NULL,
  product TEXT NOT NULL,
  metric TEXT NOT NULL,
  month TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, product, metric, month)
);

CREATE INDEX IF NOT EXISTS idx_product_usage_owner_month
  ON product_usage_monthly(owner, month);
