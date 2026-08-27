# Database

RideShare Genesis V1 ships with a single consolidated schema, applied as a
migration at backend startup (see `backend/src/db/migrate.js`).

- `schema/001_initial_schema.sql` — the full reference schema (source of truth
  for table shapes, used in docs and for provisioning a fresh Postgres
  instance in later versions).
- `migrations/0001_init.sql` — the migration actually executed against the
  runtime SQLite database. It is idempotent (`CREATE TABLE IF NOT EXISTS`),
  so it is safe to run on every boot.

## Tables

| Table          | Purpose                                                        |
|----------------|------------------------------------------------------------------|
| `users`        | Account credentials and role/status                             |
| `profiles`     | Rider/driver profile, preferences, and Decision DNA weighting    |
| `journeys`     | Offered rides and journey requests                               |
| `matches`      | Matching engine output + Decision DNA explanation per match      |
| `bookings`     | Booking lifecycle state machine                                  |
| `payments`     | Payment-choice architecture transaction records                  |
| `messages`     | Per-booking messaging threads                                    |
| `safety_cases` | Safety Centre reports (SOS, incidents, concerns)                 |
| `audit_events` | Governance audit trail for sensitive state transitions           |

## Adding a migration

Add a new numbered file to `database/migrations/` (e.g. `0002_add_x.sql`) and
register it in `backend/src/db/migrate.js`'s `MIGRATIONS` list, in order.
Migrations are tracked in a `schema_migrations` table so each file runs once.
