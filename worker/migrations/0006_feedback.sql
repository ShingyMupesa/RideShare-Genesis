-- Public, unauthenticated feedback (distinct from the Safety Centre's
-- login-required "General feedback" report category). The running Worker
-- self-provisions this table via ensureTable() in src/routes/feedback.js
-- (same pattern as page_events in tracking.js); this file documents the
-- shape for a fresh environment.
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, message TEXT NOT NULL, email TEXT, page TEXT, user_id TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
