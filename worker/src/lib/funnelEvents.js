import { newId } from './ids.js';

// Real signup/booking funnel instrumentation — a separate concern from
// tracking.js's page_events (anonymous pitch-page analytics). These rows
// are authenticated-context: user_id is attached whenever a session exists,
// null otherwise. A real migration (worker/migrations/0017_funnel_events.sql)
// covers fresh environments; ensureFunnelEventsTable is the safety net for
// an already-existing production DB, following the same self-provisioning
// pattern as tracking.js/disputes.js (db.exec() splits on newlines, so the
// CREATE TABLE has to stay on one line).
export const FUNNEL_EVENT_TYPES = [
  'signup_started',
  'signup_completed',
  'first_journey_posted',
  'first_booking_made',
  'booking_completed',
];

let ensured = false;
export async function ensureFunnelEventsTable(db) {
  if (ensured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS funnel_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, visitor_id TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_funnel_events_type ON funnel_events(event_type)');
  ensured = true;
}

// Callers inside the app (journeys.js, bookings.js, users.js) are trusted —
// this silently no-ops on an unrecognised eventType rather than throwing,
// so a typo here never breaks the real feature it's attached to. The public
// HTTP route (tracking.js) validates eventType itself and returns 400
// before ever reaching this.
export async function recordFunnelEvent(db, { eventType, userId = null, visitorId = null }) {
  if (!FUNNEL_EVENT_TYPES.includes(eventType)) return;
  await ensureFunnelEventsTable(db);
  await db
    .prepare(`INSERT INTO funnel_events (id, event_type, user_id, visitor_id) VALUES (?, ?, ?, ?)`)
    .bind(newId('funnel'), eventType, userId || null, visitorId ? String(visitorId).slice(0, 64) : null)
    .run();
}
