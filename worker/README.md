# RideShare Genesis — Cloudflare Workers deployment

A from-scratch port of `backend/` (Node/Express + better-sqlite3 + Socket.IO)
onto the Cloudflare Workers runtime, alongside the same `frontend/` React app
built as static assets served from the same Worker. This is a second,
independent deployment target — `backend/` and `docker-compose.yml` remain
the reference implementation for local dev and self-hosted/Docker
deployment; nothing there changed.

| Reference (`backend/`)        | Workers port (`worker/`)                  |
|--------------------------------|---------------------------------------------|
| Express                        | [Hono](https://hono.dev)                     |
| better-sqlite3 (file)           | Cloudflare D1 (same SQLite schema)           |
| jsonwebtoken (Node crypto)      | Hand-rolled HS256 JWT via Web Crypto (`src/lib/jwt.js`) |
| Socket.IO                       | Durable Object (`BookingRoom`) + native WebSocket |
| `docker-compose` / nginx        | Workers static assets (single origin)         |

Business logic (matching score math, the booking state machine, the payment
provider contract, the AI Gateway) is the same logic, adapted from sync to
async where D1 requires it.

## One-time setup

```bash
cd worker
npm install

# Create the D1 database (or use the one already provisioned via MCP tools —
# see database_id in wrangler.toml) and apply the schema:
npx wrangler d1 migrations apply DB --remote

# Secrets — never committed. JWT_SECRET is required; the Worker throws on
# every request if it's unset (no insecure default, see src/lib/auth.js).
npx wrangler secret put JWT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY   # optional
```

## Deploy

```bash
# from the repo root — builds the frontend for this target (relative /api,
# native WebSocket transport) into worker/public, then deploys:
npm run deploy:worker
```

## Local development

```bash
cd worker
npx wrangler d1 migrations apply DB --local
npx wrangler dev --var JWT_SECRET:local-dev-secret
```

`wrangler dev` runs a full local emulation (Miniflare) of Workers, D1, and
Durable Objects — no Cloudflare account or network access required for this
step.

## Routing

`wrangler.toml`'s `[assets]` block serves `worker/public` (the built SPA)
directly and falls back to `index.html` for client-side routes
(`not_found_handling = "single-page-application"`). `run_worker_first =
["/api/*", "/ws/*"]` makes sure those two prefixes always reach the Hono app
in `src/index.js`, regardless of asset-routing heuristics.

## Real-time messaging

`GET /ws/booking/:id?token=<jwt>` upgrades to a WebSocket. The token travels
as a query param (browsers can't set custom headers during a WS handshake);
it's verified and the caller's booking access is checked before the
connection is ever forwarded to that booking's `BookingRoom` Durable Object,
which fans messages out to every connected participant and persists them to
D1 via the same `messages` table the REST endpoints use.
