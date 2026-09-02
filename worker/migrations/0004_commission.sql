-- Platform commission columns on payments. The rate actually applied is
-- stored per-payment (not recomputed from current config), so changing
-- PLATFORM_COMMISSION_PCT later only affects payments made after the change.
-- The running Worker self-provisions these via ALTER TABLE on first use
-- (see src/routes/payments.js's ensureCommissionColumns) the same way
-- 0002_tracking.sql's page_events table is self-provisioned; this file is
-- the documented, applied-once equivalent for a fresh environment.
ALTER TABLE payments ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0;
