# RideShare Genesis

Genesis V1 → make it work → test it → put it in front of real users →
improve it → deploy it.

A human-centred, explainable ridesharing platform. Every match Genesis
suggests comes with a **Decision DNA** breakdown — a transparent, weighted
explanation of *why* — instead of a black-box score.

## What's in V1

| Area | What's implemented |
|------|----------------------|
| Genesis welcome experience | Landing page with human-centred principles and a guided "how it works" |
| Authentication | Register / login (JWT + bcrypt), protected routes |
| Profile | Bio, ride preferences, tunable **Decision DNA** weights, trusted emergency contact |
| Find a Journey | Request a ride, scored against active offers in real time |
| Offer a Journey | Publish a ride with seats, price, and journey-level preferences |
| Matching engine | Explainable, weighted scoring across proximity, timing, price, preferences, reliability |
| Decision DNA & match explanation | Full factor breakdown + human-readable narrative, per match |
| Journey details | Public journey page with direct booking |
| Booking workflow | `REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED` state machine, cancellable throughout |
| Payment-choice architecture | Card / mobile money / wallet / cash via a common sandboxed provider contract |
| Messaging | Per-booking threads, real-time via Socket.IO |
| My Journeys | Dashboard of your bookings and published journeys |
| Genesis AI assistant | In-app assistant; rule-based by default, optionally enriched by the Anthropic API |
| Safety Centre | One-tap SOS, incident reporting, trusted contact, case history |
| Governance | Full audit trail (`audit_events`) behind every sensitive state change |
| Environmental impact | Vehicle-occupancy-and-fuel-type factor in Decision DNA, an estimated CO2e/fuel/vehicle-km figure on every completed booking, and a platform-wide impact tile in the admin dashboard — always labelled as an estimate |

## Project layout

```
rideshare-genesis/
├── README.md
├── package.json          # npm workspaces root
├── .env.example
├── docker-compose.yml
│
├── frontend/              # React + Vite SPA
│   ├── src/pages/
│   ├── src/components/
│   ├── src/services/
│   └── src/styles/
│
├── backend/                # Node + Express API (reference impl, local dev / Docker)
│   ├── src/{users,journeys,matching,bookings,payments,messaging,safety,governance,ai}/
│   └── tests/
│
├── worker/                 # Cloudflare Workers deployment (Hono + D1 + Durable Objects)
│   ├── src/{routes,lib,durable-objects}/
│   └── README.md
│
├── database/
│   ├── schema/
│   └── migrations/
│
└── docs/
    ├── API.md
    ├── SECURITY.md
    └── DEPLOYMENT.md
```

## Architecture

```
Mobile/Web App                Backend API              Database
├─ Authentication      ─────▶ ├─ Users          ─────▶  users, profiles
├─ Profile                    ├─ Journeys        ─────▶  journeys
├─ Find / Offer Journey       ├─ Matching        ─────▶  matches
├─ Matching / Decision DNA    ├─ Bookings        ─────▶  bookings
├─ Booking                    ├─ Payments        ─────▶  payments
├─ Payments                   ├─ Messages        ─────▶  messages
├─ Messaging                  ├─ Safety          ─────▶  safety_cases
├─ Safety Centre              └─ Governance      ─────▶  audit_events
└─ My Journeys

                    AI Gateway → Decision DNA narratives + Genesis Assistant
```

Booking lifecycle:

```
REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED
   └──────────────────────── CANCELLED (from any non-terminal state) ─────┘
```

## Quick start

```bash
npm install
cp .env.example backend/.env
cp frontend/.env.example frontend/.env

npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:5173
```

Or with Docker:

```bash
cp .env.example .env
docker compose up --build
# open http://localhost:8080
```

## Testing

```bash
npm run test:backend    # 38 tests: auth, journeys, matching, bookings, payments, safety
npm run build:frontend  # production build sanity check
```

## Environmental philosophy

Genesis has two connected responsibilities: **serve the person**, and
**respect the planet**. We don't believe sustainability should mean making
mobility less accessible or less convenient — the environmental case is what
better-utilised vehicle capacity makes *possible*, not a constraint riders
have to accept.

Every day, vehicles travel with unused seats while other people make similar
journeys separately. Genesis is designed to close that gap:

1. **Share existing capacity** — use seats already going that way, rather than adding a new vehicle to the road.
2. **Reduce unnecessary duplication** — help people making similar journeys travel together, where it suits them.
3. **Encourage efficient mobility** — surface shared, public, and active options alongside driving, not behind a driving-by-default assumption.
4. **Support the transition to cleaner mobility** — Decision DNA's environmental factor already scores EV and hybrid offers higher; vehicle type is captured on every offered journey.
5. **Measure the impact** — every completed booking gets an estimated CO2e, fuel, and vehicle-km figure, with its methodology stated alongside it, and the admin dashboard rolls this up platform-wide.

We will not claim Genesis reduces emissions by a headline percentage until
we've measured our own journeys. What's already shipped is principles 4 and
5: an explainable environmental factor inside the matching engine, and an
estimated (not measured) impact figure computed from published per-km
emission factors — see `backend/src/utils/impact.js` /
`worker/src/lib/impact.js` for the calculation, and
[`docs/API.md`](docs/API.md#environmental-impact-estimated) for the API
shape. Calibrating those factors against real trip telemetry, and building
out the fuller Environmental Impact Dashboard (seats utilised, EV/hybrid
participation trends, avoided vehicle-km over time), is future work once
there's enough completed-trip volume to measure against.

## Monetization & marketplace integrity

Genesis takes a commission on completed rides. Two things we're deliberate about:

**Getting to launch liquidity first.** `PLATFORM_COMMISSION_PCT` defaults to
`0` — the plan is an early-bird period (an initial cohort, split between
drivers and riders, using the platform commission-free) to seed density on
a route before charging anything. The commission plumbing is already live
end-to-end (every payment records the rate that applied *at the time*, so
raising the percentage later never rewrites history) — turning it on is a
config change, not a rebuild.

**Marketplace leakage.** The hard problem in any two-sided marketplace is
regulars going off-platform once they've found each other — no rideshare or
gig platform has ever solved this with enforcement, and we won't try to
police it. The plan is to make staying on-platform worth more than the
commission saved by leaving:

- **Ride Passes** — a discounted recurring rate for a driver/passenger pair
  who repeat the same route, so defecting to cash saves them little.
- **On-platform-only protections** — Safety Centre (SOS, incident
  reporting), dispute resolution, and any future insurance/liability cover
  apply only to trips booked and paid through Genesis.
- **Win-back, not detection** — a pair whose booking frequency drops off
  gets proactively offered a Ride Pass, rather than the platform trying to
  catch them going around it.

None of the above is built yet — it's the natural next step once there's
real repeat-ride data to design a Ride Pass rate against.

## Docs

- [`docs/API.md`](docs/API.md) — full endpoint reference
- [`docs/SECURITY.md`](docs/SECURITY.md) — auth, authorization, validation, data handling
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — local, Docker, and cloud deployment
- [`database/README.md`](database/README.md) — schema and migrations

## License

MIT
