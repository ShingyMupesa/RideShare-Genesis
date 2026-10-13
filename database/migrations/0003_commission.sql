-- Platform commission columns on payments. The rate actually applied is
-- stored per-payment (not recomputed from current config), so changing
-- PLATFORM_COMMISSION_PCT later only affects payments made after the change.
ALTER TABLE payments ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0;
