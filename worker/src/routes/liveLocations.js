import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';

export const liveLocations = new Hono();

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so this has to stay on one line — see tracking.js/disputes.js
// for the same pattern. A real migration (worker/migrations/0014_live_locations.sql)
// covers fresh environments; this is the safety net for an already-existing
// production DB. One upserted row per currently-tracked booking (not an
// append log) — writes only ever happen from inside BookingRoom (the
// Durable Object), never through a public endpoint.
export async function ensureLiveLocationsTable(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS live_locations (booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE, lat REAL NOT NULL, lng REAL NOT NULL, heading REAL, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
}

// Admin-only: shows every booking currently being tracked (a ping within
// the last 2 minutes), with the journey's origin/destination as a human
// readable route label.
liveLocations.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureLiveLocationsTable(db);

  const { results } = await db
    .prepare(
      `SELECT
         ll.booking_id AS bookingId,
         ll.lat AS lat,
         ll.lng AS lng,
         ll.heading AS heading,
         ll.updated_at AS updatedAt,
         j.origin_label AS originLabel,
         j.destination_label AS destinationLabel
       FROM live_locations ll
       JOIN bookings b ON b.id = ll.booking_id
       JOIN journeys j ON j.id = b.journey_id
       WHERE ll.updated_at >= datetime('now', '-2 minutes')
       ORDER BY ll.updated_at DESC`
    )
    .all();

  return c.json({
    active: results.map((r) => ({
      bookingId: r.bookingId,
      lat: r.lat,
      lng: r.lng,
      heading: r.heading,
      updatedAt: r.updatedAt,
      routeLabel: `${r.originLabel} → ${r.destinationLabel}`,
    })),
    generatedAt: new Date().toISOString(),
  });
});
