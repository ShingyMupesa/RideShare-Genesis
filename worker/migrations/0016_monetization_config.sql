CREATE TABLE IF NOT EXISTS ad_slots (
  id TEXT PRIMARY KEY, placement TEXT NOT NULL, name TEXT NOT NULL,
  creative_url TEXT, target_url TEXT, active INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT, ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS insurance_partners (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_email TEXT, contact_phone TEXT,
  product_desc TEXT, referral_url TEXT, active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_ad_slots_placement ON ad_slots(placement);
