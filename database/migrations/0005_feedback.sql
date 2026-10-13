-- Public, unauthenticated feedback (distinct from the Safety Centre's
-- login-required "General feedback" report category) — anyone browsing the
-- app, the pitch's live link, or the installed PWA can leave a note before
-- ever creating an account.
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  message    TEXT NOT NULL,
  email      TEXT,
  page       TEXT,
  user_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
