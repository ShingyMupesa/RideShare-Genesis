# Deployment

RideShare Genesis V1 ships as two deployable units — a Node/Express API and
a static React SPA — plus a SQLite database file that persists on a volume.

## Local development

```bash
npm install                # installs backend + frontend workspaces
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev:backend        # http://localhost:4000
npm run dev:frontend        # http://localhost:5173 (proxies /api to :4000)
```

## Running tests

```bash
npm run test:backend        # node:test + supertest, 30+ assertions across
                             # auth, journeys, matching, bookings, payments, safety
npm run build:frontend      # production Vite build (fails the build on errors)
```

## Docker (recommended for a first deploy)

```bash
cp .env.example .env        # set JWT_SECRET, CLIENT_ORIGIN, etc.
docker compose up --build
```

This builds and runs:

- `backend` — Node API on port `4000`, SQLite persisted to the
  `genesis-data` volume.
- `frontend` — the Vite production build served by nginx on port `8080`,
  proxying `/api` and `/socket.io` to the backend container.

Visit `http://localhost:8080`.

## Environment variables

| Variable            | Where            | Purpose                                            |
|----------------------|------------------|------------------------------------------------------|
| `PORT`               | backend          | API port (default 4000)                                |
| `JWT_SECRET`         | backend          | **Set a strong random value in production.**            |
| `JWT_EXPIRES_IN`     | backend          | Token lifetime (default `7d`)                            |
| `CLIENT_ORIGIN`      | backend          | CORS origin allowed to call the API                       |
| `DATABASE_FILE`      | backend          | SQLite file path                                           |
| `ANTHROPIC_API_KEY`  | backend          | Optional — enables AI-gateway enrichment                    |
| `VITE_API_URL`       | frontend (build) | Base API URL the SPA calls                                   |
| `VITE_SOCKET_URL`    | frontend (build) | Socket.IO base URL                                             |

## Cloud deployment sketch

Any platform that runs a long-lived Node process + static hosting works:

1. **API**: deploy `backend/` as a container (Fly.io, Render, Railway, ECS,
   Cloud Run). Attach a persistent volume at the path in `DATABASE_FILE`, or
   swap `better-sqlite3` for a managed Postgres later (the schema in
   `database/schema/001_initial_schema.sql` is written to translate cleanly).
2. **Web**: deploy `frontend/` as a static build (Vercel, Netlify, Cloudflare
   Pages, or the bundled nginx image) with `VITE_API_URL` pointing at the
   deployed API's public URL.
3. Set `JWT_SECRET` to a long random value and `CLIENT_ORIGIN` to the
   frontend's public origin.
4. Point CI (`.github/workflows/ci.yml`) at your deploy step once you have a
   target — it currently runs tests and the production build on every push.

## Database migrations in production

Migrations run automatically and idempotently on backend boot
(`runMigrations()` in `backend/src/db/migrate.js`). To ship a schema change,
add a new file under `database/migrations/`, register it in `MIGRATIONS`,
and redeploy — no manual migration step required.

## Readiness checklist

- [x] Automated backend test suite (34 tests) green
- [x] Frontend production build green
- [x] Dockerfiles for both services + `docker-compose.yml`
- [x] CI workflow running tests + build on every push
- [x] `.env.example` documents every required variable
- [x] No secrets committed (`.env`, `*.sqlite` gitignored)
