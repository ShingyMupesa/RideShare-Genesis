-- Web-based account-deletion requests, for someone who wants their data
-- deleted without logging in (e.g. they've already uninstalled the app) —
-- Play Store policy requires this path to exist alongside in-app deletion.
-- Same shape and security model as password_resets: only a token hash is
-- stored, the raw token exists only in the emailed confirmation link.
CREATE TABLE IF NOT EXISTS deletion_requests (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  confirmed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_token_hash ON deletion_requests(token_hash);

-- users.status already supports arbitrary text ('active' | 'suspended' so
-- far) — deleteAccount() below starts writing 'deleted' into it, no schema
-- change needed for that.
