-- RideShare Genesis V1 — Initial schema
-- Portable SQL (targets SQLite for the reference backend; column types are
-- chosen to also map cleanly onto Postgres for a future migration).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'member', -- member | admin
  status        TEXT NOT NULL DEFAULT 'active', -- active | suspended
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio                 TEXT,
  avatar_color        TEXT DEFAULT '#5B4CFF',
  home_city           TEXT,
  verified_id         INTEGER NOT NULL DEFAULT 0,
  verified_email      INTEGER NOT NULL DEFAULT 0,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  preferences_json    TEXT NOT NULL DEFAULT '{}', -- chattiness, music, smoking, pets, gender_pref, luggage
  decision_dna_json    TEXT NOT NULL DEFAULT '{}', -- learned/self-declared weighting of what this rider values in a match
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS journeys (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL, -- offer | request
  origin_label     TEXT NOT NULL,
  origin_lat       REAL NOT NULL,
  origin_lng       REAL NOT NULL,
  destination_label TEXT NOT NULL,
  destination_lat  REAL NOT NULL,
  destination_lng  REAL NOT NULL,
  departure_time   TEXT NOT NULL, -- ISO8601
  seats_total      INTEGER NOT NULL DEFAULT 1,
  seats_available  INTEGER NOT NULL DEFAULT 1,
  price_per_seat   REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  preferences_json TEXT NOT NULL DEFAULT '{}', -- journey-specific overrides of profile preferences
  status           TEXT NOT NULL DEFAULT 'active', -- active | full | cancelled | completed
  vehicle_type     TEXT, -- electric | hybrid | petrol | diesel | other (offer journeys only; added in 0002)
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_journeys_owner ON journeys(owner_id);
CREATE INDEX IF NOT EXISTS idx_journeys_type_status ON journeys(type, status);
CREATE INDEX IF NOT EXISTS idx_journeys_departure ON journeys(departure_time);

CREATE TABLE IF NOT EXISTS matches (
  id               TEXT PRIMARY KEY,
  request_journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  offer_journey_id   TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  score            REAL NOT NULL,
  decision_dna_json TEXT NOT NULL DEFAULT '{}', -- explainable factor breakdown backing `score`
  status           TEXT NOT NULL DEFAULT 'suggested', -- suggested | accepted | dismissed
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_matches_request ON matches(request_journey_id);
CREATE INDEX IF NOT EXISTS idx_matches_offer ON matches(offer_journey_id);

CREATE TABLE IF NOT EXISTS bookings (
  id               TEXT PRIMARY KEY,
  journey_id       TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  passenger_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id         TEXT REFERENCES matches(id) ON DELETE SET NULL,
  seats            INTEGER NOT NULL DEFAULT 1,
  total_price      REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT NOT NULL DEFAULT 'REQUESTED',
  -- REQUESTED -> MATCHED -> BOOKING_REQUESTED -> CONFIRMED -> IN_PROGRESS -> COMPLETED
  -- any state may transition to CANCELLED
  status_history_json TEXT NOT NULL DEFAULT '[]',
  impact_json      TEXT NOT NULL DEFAULT '{}', -- estimated environmental impact, set on completion (added in 0002)
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_bookings_journey ON bookings(journey_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payer_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method         TEXT NOT NULL, -- card | mobile_money | cash | wallet
  provider       TEXT NOT NULL DEFAULT 'genesis_sandbox',
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  status         TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED
  reference      TEXT,
  created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);

CREATE TABLE IF NOT EXISTS safety_cases (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id   TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  category     TEXT NOT NULL, -- sos | incident_report | safety_concern | feedback
  severity     TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'open', -- open | in_review | resolved
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_safety_reporter ON safety_cases(reporter_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL, -- e.g. booking.status_changed, payment.captured, safety.sos
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
