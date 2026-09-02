-- Driver verification, third document: vehicle insurance. Closes the gap
-- the compliance overview flagged explicitly ("vehicle insurance is not
-- confirmed by the platform") — same photo + opaque-key storage pattern
-- as the license and vehicle registration documents.
ALTER TABLE driver_verifications ADD COLUMN insurance_policy_number TEXT;
ALTER TABLE driver_verifications ADD COLUMN insurance_expiry TEXT;
ALTER TABLE driver_verifications ADD COLUMN insurance_photo_key TEXT;
ALTER TABLE driver_verifications ADD COLUMN insurance_photo_mime TEXT;
