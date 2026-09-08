-- Password reset tokens. Only a SHA-256 hash of the token is stored — the
-- raw token exists only in the emailed link and briefly in memory, the
-- same principle as never storing a plaintext password. The running
-- Worker self-provisions this table via ensureTable() in src/routes/users.js
-- (same pattern as page_events in tracking.js); this file documents the
-- shape for a fresh environment.
CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
