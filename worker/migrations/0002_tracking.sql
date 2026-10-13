-- Pitch page / marketing analytics. Deliberately minimal: no fingerprinting,
-- no cross-site identifiers — just enough to answer "is anyone visiting, and
-- which call-to-action are they taking" for the investor/tester pitch page.

CREATE TABLE IF NOT EXISTS page_events (
  id           TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL, -- page_view | cta_click
  page         TEXT NOT NULL, -- which page/artifact sent this (e.g. 'pitch')
  label        TEXT,          -- for cta_click: which CTA ('early_access' | 'investor_contact' | ...)
  referrer     TEXT,
  visitor_id   TEXT,          -- random id the client generates and keeps in localStorage; not derived from PII
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_page_events_type ON page_events(event_type);
CREATE INDEX IF NOT EXISTS idx_page_events_created ON page_events(created_at);
