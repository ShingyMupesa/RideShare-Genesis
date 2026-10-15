-- Disputes: a separate, amount-bearing entity from safety_cases (which
-- never carry a disputed amount or a resolution/refund workflow).
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  filed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  safety_case_id TEXT REFERENCES safety_cases(id) ON DELETE SET NULL,
  category TEXT NOT NULL, -- fare_dispute | no_show | property_damage | conduct | other
  disputed_amount REAL,
  currency TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | under_review | resolved_refunded | resolved_denied | resolved_other
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_disputes_booking ON disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
