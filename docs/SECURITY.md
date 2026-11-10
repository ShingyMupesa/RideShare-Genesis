# Security

## Authentication

- Passwords are hashed with bcrypt (`bcryptjs`, 10 salt rounds) — plaintext
  passwords are never stored or logged.
- Sessions are stateless JWTs (`jsonwebtoken`), signed with `JWT_SECRET` and
  expiring per `JWT_EXPIRES_IN` (default 7 days). Rotate `JWT_SECRET` in
  production and keep it out of version control (`.env` is gitignored).
  There is no hardcoded fallback signing key — the server refuses to start
  if `JWT_SECRET` is unset (`backend/src/middleware/auth.js`), and
  `docker-compose.yml` fails the same way rather than silently using an
  insecure default.
- All mutating routes require a valid `Authorization: Bearer <token>` header,
  verified server-side on every request (`backend/src/middleware/auth.js`).

## Authorization

- Ownership is checked at the route layer for every sensitive action: only a
  journey's owner can cancel it, only a match's requester can accept/dismiss
  it, only a booking's passenger or the journey owner can view/act on it, and
  only the payer can pay for their own booking.
- The booking workflow is enforced as an explicit state machine
  (`backend/src/bookings/stateMachine.js`) — invalid transitions (e.g.
  skipping straight to `COMPLETED`) are rejected server-side regardless of
  what the client sends.
- Governance/audit endpoints require the `admin` role.

## Input validation

- Every write route validates its body before touching the database (email
  format, password length, coordinate types, ISO date strings, positive
  integers for seats, supported payment methods, safety report categories).
- SQL is parameterized throughout via `better-sqlite3` prepared statements —
  no string-built queries, so there is no SQL injection surface from
  user-controlled input.

## Data handling

- The database file (`backend/data/*.sqlite`) is gitignored and excluded from
  Docker images; it should be backed by a persistent volume in any real
  deployment (see `docker-compose.yml`).
- `audit_events` gives an immutable, queryable trail of sensitive actions
  (bookings, payments, safety reports) for accountability and incident
  investigation.

## Payments

- V1 ships a sandboxed payment gateway (`backend/src/payments/providers.js`)
  — no real card or mobile-money data is collected or transmitted. Swapping
  in a real processor means implementing the same `authorize`/`capture`
  contract behind a feature flag; no route or schema changes required.

## AI Gateway

- The optional Anthropic integration is opt-in via `ANTHROPIC_API_KEY`. If
  unset, or if the call fails/times out (8s), Genesis falls back to fully
  deterministic, rule-based answers — the assistant is never a hard
  dependency and never blocks core flows.
- No booking, payment, or personal data is sent to the model beyond the
  user's own Decision DNA weights, and only when they are authenticated and
  asking a matching-related question.

## Safety Centre

- SOS reports are always logged at `critical` severity and audited
  immediately, independent of any other system being available.
- Emergency contact details are stored per-profile and only ever returned to
  the authenticated owner of that profile.

## Reporting a vulnerability

This is a V1 reference build. If you find a security issue, please open a
private security advisory on the repository rather than a public issue.

## Admin Team and dashboard access

The admin dashboard (`/admin`) is restricted to the **Owner** and approved
**Admin Team** members. The full model is documented at the top of
`worker/src/lib/adminTeam.js`; in short:

- **Owner** is one user account, pinned by user ID in the `platform_settings`
  row `owner_user_id` (set directly in D1, never in the repo, never by email).
  The Owner can't be suspended, removed or demoted through the API. Changing
  the Owner is a deliberate database operation.
- **Joining the team:** a signed-in user requests access from their Profile
  ("Admin Dashboard" card). The Owner gets an email and approves or rejects
  the request in *Admin Team*, choosing a role. Nothing is granted until then.
- **Roles:** `super_admin` (Owner-appointed only; can manage the team except
  the Owner and other Super Admins), `operations`, `verifier`, `support`,
  `finance`, `viewer`. Each role grants read or write per area (analytics,
  drivers, support, users, finance, config), enforced server-side in
  `requireAdmin`. Unknown admin routes fail closed.
- **Sign-in:** password re-entry issues an 8-hour admin session token, signed
  with a key derived from `JWT_SECRET` that ordinary app tokens never use.
  Five wrong passwords lock admin sign-in for that account for 15 minutes
  (stored in D1).
- **Revocation:** suspending, removing or changing a member's role bumps
  their session version, which ends their open sessions on the next request.
  Every member (and the Owner) can also sign out all their own sessions.
- **Team changes** need the actor's password again and are written to
  `audit_events` (`admin.*`). If a Super Admin makes a change, the Owner is
  emailed.
- **Break-glass:** the legacy `ADMIN_TOKEN` secret still opens the data
  screens but can never manage the Admin Team. Rotate it with
  `wrangler secret put ADMIN_TOKEN`, or delete it once the team is set up.
- **Emails to the Owner** (driver verification submissions, access requests)
  are sent through Resend to the Owner account's email and contain no
  documents, only a link to the dashboard.
