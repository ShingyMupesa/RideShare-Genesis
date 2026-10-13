-- Records exactly when a user affirmatively accepted the Terms & Conditions
-- at registration, so acceptance is auditable rather than merely implied.
ALTER TABLE users ADD COLUMN accepted_terms_at TEXT;
