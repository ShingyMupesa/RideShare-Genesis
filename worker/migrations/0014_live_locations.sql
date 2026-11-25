-- One upserted row per currently-tracked booking (not an append log) — the
-- live GPS pipeline only ever cares about each booking's latest position.
-- Written from inside the booking's BookingRoom Durable Object (worker) or
-- the Socket.IO server (backend), throttled to at most once every 15s per
-- booking; read by the admin live-map endpoint.
CREATE TABLE IF NOT EXISTS live_locations (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  heading REAL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
