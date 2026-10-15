import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

// Real signup/booking funnel instrumentation — mirrors
// worker/src/lib/funnelEvents.js. The `funnel_events` table is provisioned
// by database/migrations/0016_funnel_events.sql (applied by runMigrations()),
// consistent with this backend's convention of relying on real migrations
// rather than self-provisioning (see disputes/repository.js's equivalent
// note).
export const FUNNEL_EVENT_TYPES = [
  'signup_started',
  'signup_completed',
  'first_journey_posted',
  'first_booking_made',
  'booking_completed',
];

// Callers inside the app (journeys, bookings, users routes) are trusted —
// this silently no-ops on an unrecognised eventType rather than throwing.
// The public HTTP route (tracking/routes.js) validates eventType itself and
// returns 400 before ever reaching this.
export function recordFunnelEvent({ eventType, userId = null, visitorId = null }) {
  if (!FUNNEL_EVENT_TYPES.includes(eventType)) return;
  db.prepare(`INSERT INTO funnel_events (id, event_type, user_id, visitor_id) VALUES (?, ?, ?, ?)`).run(
    newId('funnel'),
    eventType,
    userId || null,
    visitorId ? String(visitorId).slice(0, 64) : null
  );
}

export function getFunnelStats({ days = 30 } = {}) {
  const rows = db
    .prepare(
      `SELECT event_type, COUNT(*) AS n FROM funnel_events
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY event_type`
    )
    .all(days);

  const counts = Object.fromEntries(FUNNEL_EVENT_TYPES.map((t) => [t, 0]));
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.event_type)) counts[row.event_type] = row.n;
  }
  return FUNNEL_EVENT_TYPES.map((eventType) => ({ eventType, count: counts[eventType] }));
}
