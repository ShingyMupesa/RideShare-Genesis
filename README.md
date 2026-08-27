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
├── backend/                # Node + Express API
│   ├── src/{users,journeys,matching,bookings,payments,messaging,safety,governance,ai}/
│   └── tests/
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
npm run test:backend    # 34 tests: auth, journeys, matching, bookings, payments, safety
npm run build:frontend  # production build sanity check
```

## Docs

- [`docs/API.md`](docs/API.md) — full endpoint reference
- [`docs/SECURITY.md`](docs/SECURITY.md) — auth, authorization, validation, data handling
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — local, Docker, and cloud deployment
- [`database/README.md`](database/README.md) — schema and migrations

## License

MIT
