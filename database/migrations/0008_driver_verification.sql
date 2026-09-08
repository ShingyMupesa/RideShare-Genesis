-- Driver verification: a manual, admin-reviewed KYC-lite check a driver
-- completes before their offers count as coming from a "Verified Driver".
-- profiles carries the current status for cheap badge/gating lookups;
-- driver_verifications is the full submission + review audit trail (one
-- row per attempt, so a rejected driver's resubmission is a new row).
ALTER TABLE profiles ADD COLUMN driver_verification_status TEXT NOT NULL DEFAULT 'unverified';
-- unverified | pending | verified | rejected
ALTER TABLE profiles ADD COLUMN driver_verification_updated_at TEXT;

CREATE TABLE IF NOT EXISTS driver_verifications (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_legal_name    TEXT NOT NULL,
  license_number     TEXT NOT NULL,
  license_expiry     TEXT,
  vehicle_make_model TEXT,
  vehicle_plate      TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending', -- pending | verified | rejected
  submitted_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  reviewed_at        TEXT,
  reviewed_by        TEXT,
  review_note        TEXT,
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_driver_verifications_user ON driver_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_verifications_status ON driver_verifications(status);

-- Small key/value store for platform-wide toggles. Its first and only key
-- for now is driver_verification_enforced ('0' | '1') — absent means off,
-- so this feature ships fully built but inert until an admin flips it on.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
