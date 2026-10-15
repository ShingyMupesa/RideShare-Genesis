import { db } from '../db/connection.js';

// The `live_locations` table is provisioned by
// database/migrations/0013_live_locations.sql (applied by runMigrations()),
// consistent with this backend's convention of relying on real migrations
// rather than self-provisioning (see disputes/repository.js's equivalent
// note). One upserted row per currently-tracked booking (not an append
// log) — writes only ever happen from socket.js's 'location:ping' handler.

export function upsertLiveLocation({ bookingId, lat, lng, heading }) {
  db.prepare(
    `INSERT INTO live_locations (booking_id, lat, lng, heading, updated_at)
     VALUES (@booking_id, @lat, @lng, @heading, CURRENT_TIMESTAMP)
     ON CONFLICT(booking_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, heading=excluded.heading, updated_at=CURRENT_TIMESTAMP`
  ).run({ booking_id: bookingId, lat, lng, heading: heading ?? null });
}

// Every booking currently being tracked (a ping within the last 2 minutes),
// joined to its journey for a human-readable route label — mirrors
// worker/src/routes/liveLocations.js's query exactly.
export function listActiveLiveLocations() {
  const rows = db
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

  return rows.map((r) => ({
    bookingId: r.bookingId,
    lat: r.lat,
    lng: r.lng,
    heading: r.heading,
    updatedAt: r.updatedAt,
    routeLabel: `${r.originLabel} → ${r.destinationLabel}`,
  }));
}
