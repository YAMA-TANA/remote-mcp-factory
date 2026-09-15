CREATE TABLE IF NOT EXISTS bundle_entitlements (
  owner TEXT NOT NULL,
  bundle TEXT NOT NULL,
  product TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tiny', 'pro')),
  source TEXT NOT NULL DEFAULT 'billing',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, bundle, product)
);

CREATE INDEX IF NOT EXISTS idx_bundle_entitlements_owner_active
  ON bundle_entitlements(owner, active);

CREATE INDEX IF NOT EXISTS idx_bundle_entitlements_owner_product
  ON bundle_entitlements(owner, product, active);
