-- Funnel instrumentation: real signup/booking funnel events, a different
-- concern from page_events (tracking.js) which is anonymous pitch-page
-- analytics. Rows here are authenticated-context — user_id is attached
-- whenever a session exists (optionalAuth), null otherwise.
CREATE TABLE IF NOT EXISTS funnel_events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL, visitor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_funnel_events_type ON funnel_events(event_type);
