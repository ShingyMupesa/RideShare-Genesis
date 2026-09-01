-- Web Push subscriptions, one row per browser/device a user has enabled
-- notifications on. keys are stored (not just endpoint) so a future move
-- to encrypted payloads doesn't require every user to re-subscribe.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
