-- Driver verification, tier 1: real document photos instead of typed-in
-- text alone. Only an opaque storage key + mime type live in this table —
-- the actual bytes live in object storage (local disk for the backend,
-- Workers KV for the worker; see the driverVerification modules), so this
-- table never grows large and the storage backend can change without a
-- schema change.
ALTER TABLE driver_verifications ADD COLUMN license_photo_key TEXT;
ALTER TABLE driver_verifications ADD COLUMN license_photo_mime TEXT;
ALTER TABLE driver_verifications ADD COLUMN vehicle_reg_photo_key TEXT;
ALTER TABLE driver_verifications ADD COLUMN vehicle_reg_photo_mime TEXT;
