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

## Cloudflare Workers Builds (CI/CD)

Pushes to this repo also trigger Cloudflare's own Git-integrated CI/CD
("Workers Builds"), which deploys automatically — separately from, and in
addition to, the `frontend-build`/`backend-tests` GitHub Actions checks and
the manual `npm run deploy:worker` above. Its settings live **only** in the
Cloudflare dashboard (Workers & Pages → `rideshare-genesis` → Settings →
Build) — nothing in this repo controls them, so they're recorded here as
the source of truth to diff the dashboard against if a build ever fails
unexpectedly:

| Setting | Value |
|---|---|
| Root Directory | `worker` |
| Build command | `cd .. && npm install && npm run build:worker-frontend && cd worker` |
| Deploy command | *(default)* `npx wrangler versions upload` on non-production branches, `npx wrangler deploy` on the production branch |

The `worker-deploy-dryrun` job in `.github/workflows/ci.yml` runs this
exact sequence (plus `wrangler versions upload --dry-run`, which needs no
Cloudflare credentials) on every push, so a Root Directory, Build command,
or Deploy command mismatch shows up as a normal failing CI check within
seconds — instead of only on Cloudflare's own check, or going unnoticed
until someone happens to look.

**If a Cloudflare build fails, the error names which setting drifted:**

- `Missing entry-point to Worker script or to assets directory` — the
  deploy command ran from a directory with no `wrangler.toml` in it. Root
  Directory has drifted from `worker` (or wrangler.toml moved/was deleted).
- `The directory specified by the "assets.directory" field ... does not
  exist: .../worker/public` — the build command didn't run, or didn't
  produce `worker/public`, before the deploy command ran. Check the Build
  command field matches the table above exactly — a stray `cd ..` without
  the matching `&& cd worker`, or a script name typo, breaks silently
  here. If `worker-deploy-dryrun` is green in GitHub Actions but Cloudflare
  still fails, the dashboard settings themselves have diverged from this
  table — fix them there first, then update this table to match.

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
