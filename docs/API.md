# RideShare Genesis API

Base URL: `http://localhost:4000/api` (or `VITE_API_URL` in the frontend).

All authenticated routes expect `Authorization: Bearer <token>`, issued by
`/users/register` or `/users/login`. Errors are returned as:

```json
{ "error": { "code": "BAD_REQUEST", "message": "..." } }
```

## Users & Profile

| Method | Path                  | Auth | Description                                   |
|--------|-----------------------|------|------------------------------------------------|
| POST   | `/users/register`     | no   | Create an account, returns `{ token, user }`. **`acceptedTerms` must be `true`** — registration is rejected otherwise. The user's `accepted_terms_at` timestamp is set server-side at that moment, so acceptance is auditable rather than merely implied. |
| POST   | `/users/login`        | no   | Log in, returns `{ token, user }`              |
| GET    | `/users/me`           | yes  | Current user + profile                         |
| PATCH  | `/users/me/profile`   | yes  | Update bio, preferences, Decision DNA weights  |
| POST   | `/users/forgot-password` | no | `{ email }` → generic message regardless of whether the account exists (avoids leaking which emails are registered). Emails a reset link via Resend if `RESEND_API_KEY` is configured; otherwise the link is only logged server-side. |
| POST   | `/users/reset-password`  | no | `{ token, newPassword }` → `{ token, user }` on success. The token is single-use, expires after 30 minutes, and only its SHA-256 hash is ever stored. |

## Journeys (Find / Offer)

| Method | Path                     | Auth  | Description                                             |
|--------|--------------------------|-------|-----------------------------------------------------------|
| POST   | `/journeys`              | yes   | Create an `offer` or `request` journey. Requests trigger matching and return `{ journey, matches }`. **`currency` is required** — a 3-letter code (e.g. `KES`, `USD`), never defaulted server-side, so every price is always shown with an explicit currency rather than an assumed one. Offers may set `vehicleType` (`electric`\|`hybrid`\|`petrol`\|`diesel`\|`other`) — optional, used for the matching engine's environmental factor and for estimating impact once a booking completes. When [driver verification enforcement](#driver-verification) is on, posting an `offer` as an unverified/pending/rejected driver returns `403 DRIVER_VERIFICATION_REQUIRED` with `details.status`; `request` journeys are never gated. |
| GET    | `/journeys`              | no*   | List journeys. Query: `type`, `status`, `mine=true` (requires auth). Without `mine=true`, any `request` journey that isn't the caller's own is redacted to route labels and trip terms only — `origin`/`destination` lose `lat`/`lng` and `ownerId` is stripped — the same privacy boundary `GET /journeys/:id` enforces, applied per-item here so the browse view (`/browse` in the frontend) can safely show open requests to any driver without leaking exact pickup coordinates. Every journey also carries `ownerDriverVerified` (only meaningful for `offer` journeys) so the frontend can render a "Verified Driver" badge without a second lookup. |
| GET    | `/journeys/:id`          | no    | Get a single journey                                     |
| POST   | `/journeys/:id/cancel`   | yes   | Cancel a journey you own                                  |

## Matching / Decision DNA

| Method | Path                                     | Auth | Description                                    |
|--------|-------------------------------------------|------|--------------------------------------------------|
| POST   | `/matching/journeys/:journeyId/refresh`   | yes  | Re-run matching for a request journey             |
| GET    | `/matching/:id`                           | yes  | Full match record                                  |
| GET    | `/matching/:id/explanation`               | yes  | Decision DNA narrative + factor breakdown          |
| POST   | `/matching/:id/accept`                    | yes  | Accept a match (requester only)                    |
| POST   | `/matching/:id/dismiss`                   | yes  | Dismiss a match (requester only)                   |

Every match carries a `decisionDna` object:

```json
{
  "score": 0.94,
  "factors": {
    "proximity": { "score": 0.98, "weight": 0.32, "detail": "0.2 km average origin/destination gap" },
    "timing": { "score": 1, "weight": 0.28, "detail": "0 min apart on departure time" },
    "price": { "score": 1, "weight": 0.13, "detail": "..." },
    "preferences": { "score": 0.7, "weight": 0.13, "detail": "..." },
    "reliability": { "score": 0.65, "weight": 0.06, "detail": "1 completed trip on Genesis" },
    "environmental": { "score": 0.72, "weight": 0.08, "detail": "Would fill 75% of a hybrid vehicle's seats" }
  },
  "narrative": "Genesis rated this match 94/100. ..."
}
```

`environmental` scores how much of the offer vehicle's spare capacity the match would use, plus a bonus for lower-emission `vehicleType`s — it informs ranking only, and is separate from the estimated CO2e/fuel figures below (see [Environmental impact](#environmental-impact-estimated)).

`reliability` is a real queried value, not an asserted one: it starts at a neutral 0.6 baseline for a driver with no completed trips yet (never penalized for having no history), and rises by 0.05 per completed trip on the platform, capped at 1.0. The `detail` string always states the actual completed-trip count behind the number.

## Bookings (state machine)

`REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED`
(any non-terminal state may move to `CANCELLED`).

| Method | Path                       | Auth | Description                                         |
|--------|----------------------------|------|--------------------------------------------------------|
| POST   | `/bookings`                | yes  | Create a booking against an `offer` journey             |
| GET    | `/bookings/mine`           | yes  | Bookings where you're the passenger or journey owner    |
| GET    | `/bookings/:id`            | yes  | Booking + journey detail, plus each party's preferred payment method (`driverPaymentMethod`, `passengerPaymentMethod`, from their profile preferences) so both sides can coordinate how they'll settle up |
| POST   | `/bookings/:id/request`    | yes  | Passenger reserves seats (→ `BOOKING_REQUESTED`)         |
| POST   | `/bookings/:id/confirm`    | yes  | Journey owner confirms (→ `CONFIRMED`)                    |
| POST   | `/bookings/:id/start`      | yes  | Trip begins (→ `IN_PROGRESS`)                              |
| POST   | `/bookings/:id/complete`   | yes  | Trip ends (→ `COMPLETED`)                                   |
| POST   | `/bookings/:id/cancel`     | yes  | Cancel from any non-terminal state, restores seats          |

### Environmental impact (estimated)

Completing a booking (`/bookings/:id/complete`) computes and stores an `impact` object on it:

```json
{
  "distanceKm": 14.2,
  "seats": 2,
  "vehicleType": "hybrid",
  "vehicleKmAvoided": 28.4,
  "co2eKgAvoided": 3.44,
  "fuelLitersAvoided": 1.28,
  "methodology": "Estimate only: straight-line origin-to-destination distance x 1.3 routing factor x seats booked, multiplied by published average per-km emission/fuel factors by vehicle type. Represents avoided duplicate solo trips for this booking, not a measured outcome."
}
```

This is always an estimate, computed in `backend/src/utils/impact.js` (and its
worker equivalent) from a fixed per-vehicle-type emissions table — never a
measured outcome. Genesis states its environmental ambition and builds the
capability to measure it, rather than asserting an unverified reduction
figure. See [Environmental philosophy](../README.md#environmental-philosophy)
in the README.

## Payments (payment-choice architecture)

| Method | Path                          | Auth | Description                                    |
|--------|-------------------------------|------|--------------------------------------------------|
| GET    | `/payments/methods`           | no   | Sandbox methods (`card`, `mobile_money`, `wallet`, `cash`), plus `{ stripe: { enabled, publishableKey } }` and `{ mpesa: { enabled } }` for whichever real processors are configured |
| POST   | `/payments`                   | yes  | Pay for a booking via a sandbox method: `{ bookingId, method }` |
| GET    | `/payments/booking/:bookingId`| yes  | Payment history for a booking                       |
| POST   | `/payments/stripe/intent`     | yes  | Start a real Stripe payment: `{ bookingId }` → `{ paymentId, clientSecret }` |
| POST   | `/payments/stripe/:paymentId/confirm` | yes | After the frontend confirms the card with Stripe directly, re-verifies the PaymentIntent server-side and captures |
| POST   | `/payments/mpesa/stk-push`    | yes  | Start a real M-Pesa payment: `{ bookingId, phone }` → `{ paymentId, customerMessage }`. `phone` accepts `07XXXXXXXX`, `254XXXXXXXXX`, or `+254XXXXXXXXX`. `400` if the booking isn't priced in `KES` — M-Pesa never handles any other currency. |
| POST   | `/payments/mpesa/callback`    | no   | Safaricom's own async webhook — never call this directly. Public by necessity (Safaricom sends no auth header), but a callback is only ever applied if its `CheckoutRequestID` matches the one stored against the `paymentId` in the URL at STK-push time. |
| GET    | `/payments/mpesa/:paymentId/status` | yes | Polling fallback for when the callback above is slow or (common in Safaricom's sandbox) never arrives — re-asks Safaricom directly rather than trusting anything client-supplied. |

Stripe doesn't fit the synchronous authorize/capture contract the sandbox
providers share — the card is collected client-side via Stripe Elements
(never touches our servers) and may require 3D Secure — so it's a
deliberately separate two-step flow: `POST /payments/stripe/intent` creates
a PaymentIntent and a local `PENDING` payment row; the frontend calls
Stripe's `confirmCardPayment` directly with the returned `clientSecret`;
then `POST /payments/stripe/:paymentId/confirm` re-fetches the PaymentIntent
from Stripe itself (never trusting the client's own report of success) and
marks the payment `CAPTURED`. `method` on the resulting payment row is
`card_stripe`, distinguishing it from the sandbox `card` provider.

Every captured payment carries `commission_rate` (fraction, e.g. `0.1` = 10%)
and `commission_amount` — the platform's cut of the fare, computed and stored
at the moment of payment using the `PLATFORM_COMMISSION_PCT` config value
*at that time*. The rider always pays the full `amount`; commission is
deducted from the driver's payout, never added on top. `PLATFORM_COMMISSION_PCT`
defaults to `0` for the early-bird period — raising it later only affects
payments made after the change, since each payment's rate is fixed at
creation, not recomputed from current config. See
[Monetization & marketplace integrity](../README.md#monetization--marketplace-integrity)
in the README.

Every sandbox method implements the same `authorize` → `capture` provider
contract (`backend/src/payments/providers.js`); Stripe and M-Pesa are both
real-money processors with an inherently async settlement step, so — like
Stripe — M-Pesa is a deliberately separate flow rather than being forced
into that synchronous shape: `POST /payments/mpesa/stk-push` asks Safaricom
to push an "enter your PIN" prompt to the payer's phone and creates a local
`PENDING` payment row (`method: 'mpesa'`, `reference` set to Safaricom's
`CheckoutRequestID`); the *real* outcome arrives later, either via
Safaricom's callback or a `GET /payments/mpesa/:paymentId/status` poll,
either of which re-verifies with Safaricom itself before marking the
payment `CAPTURED` or `FAILED` — the client's own claim is never trusted.
See `backend/src/payments/mpesa.js` (a from-scratch Daraja API client, no
SDK — same "thin fetch wrapper" approach as `stripe.js`) and
`.env.example`/`worker/wrangler.toml` for the required configuration.

## Messaging

| Method | Path                            | Auth | Description                         |
|--------|----------------------------------|------|----------------------------------------|
| GET    | `/messages/booking/:bookingId`   | yes  | List a booking's message thread        |
| POST   | `/messages/booking/:bookingId`   | yes  | Send a message (also broadcast via socket) |

Real-time delivery uses Socket.IO (`booking:join`, `message:send`,
`message:new` events), authenticated via the same JWT passed as
`socket.handshake.auth.token`.

## Safety Centre

| Method | Path                    | Auth | Description                                          |
|--------|--------------------------|------|--------------------------------------------------------|
| GET    | `/safety/trusted-contact`| yes  | Your saved emergency contact                             |
| POST   | `/safety/sos`             | yes  | One-tap SOS — always logged as `critical` severity         |
| POST   | `/safety/report`          | yes  | File an incident report / safety concern / feedback        |
| GET    | `/safety/mine`            | yes  | Your safety case history                                   |
| POST   | `/safety/:id/resolve`     | yes  | Resolve a case (reporter or admin)                          |

## Governance

| Method | Path                      | Auth        | Description                          |
|--------|----------------------------|-------------|-----------------------------------------|
| GET    | `/governance/audit-events` | yes (admin) | Query the platform's audit trail          |

## Driver Verification

A manual, admin-reviewed check a driver completes before their offers carry
a "Verified Driver" badge. Whether it actually *blocks* posting is a
separate, admin-controlled toggle (`driver_verification_enforced`, off by
default) — the feature ships fully built but inert, exactly as designed,
until an admin turns enforcement on (planned for once commission/
monetisation goes live).

**What "verified" means today (Tier 1 — shipped):** the driver submits real
photos of their license and vehicle insurance (both required), plus vehicle
registration (optional), not just typed-in text. The server validates each
photo's magic bytes actually match a genuine JPEG/PNG/WEBP before storing
it (see `imageValidation.js` in each runtime) — so a renamed non-image file
is rejected — but nothing OCRs the document or cross-checks it against an
issuing authority. An admin looks at the photos and the typed fields
(including the insurance policy number/expiry, if given), then approves or
rejects by human judgement. That is a real, meaningful step up from a
text-only form, but it is still not independent verification — and whether
insurance is *legally* mandatory for this platform still depends on the
carpooling-vs-e-hailing classification a lawyer needs to confirm; collecting
it doesn't presuppose that answer, it just means the platform can already
act on it either way once known.

**What's planned (Tier 2/3 — deferred, revenue-gated):** once the 10%
platform commission is actually in effect, add a paid ID-verification API
(Stripe Identity, Persona, Onfido, or similar — document + liveness/selfie
check) and, where available, a direct government license-authority lookup.
Both require a paid third-party account this project doesn't have yet, so
they're intentionally not built — the schema and admin queue are already
shaped to slot a `verification_tier` / external-provider-result field in
without a redesign when that's funded.

| Method | Path                                    | Auth         | Description                          |
|--------|-------------------------------------------|--------------|------------------------------------------|
| GET    | `/driver-verification/settings`           | no           | `{ enforced }` — whether posting an offer currently requires a verified driver. |
| POST   | `/driver-verification/settings`           | yes (admin)* | `{ enforced: boolean }` — the toggle switch on the admin dashboard. |
| GET    | `/driver-verification/me`                 | yes          | `{ status, updatedAt, submission }` for the current user. `status` is one of `unverified`\|`pending`\|`verified`\|`rejected`. |
| POST   | `/driver-verification`                    | yes          | Submit `{ fullLegalName, licenseNumber, licenseExpiry?, vehicleMakeModel?, vehiclePlate, licensePhoto, vehicleRegPhoto?, insurancePolicyNumber?, insuranceExpiry?, insurancePhoto }` for review. `licensePhoto`/`vehicleRegPhoto`/`insurancePhoto` are `data:image/...;base64,...` URLs (JPEG/PNG/WEBP, max 5MB decoded) — `licensePhoto` and `insurancePhoto` are required, `vehicleRegPhoto` is optional. `409` if already `verified` or `pending`; a `rejected` driver may resubmit. |
| GET    | `/driver-verification/:id/photo/:which`   | yes (owner or admin) | Streams the raw photo bytes. `:which` is `license`, `vehicleReg`, or `insurance`. Never publicly accessible — `404` if that field has no photo, `403` if the caller is neither the submission's owner nor an admin. |
| GET    | `/driver-verification/queue`              | yes (admin)* | Pending submissions (`?status=` to see others), newest-last. |
| POST   | `/driver-verification/:id/approve`        | yes (admin)* | Marks the submission (and the driver's profile) `verified`. Sends a push notification to the driver if they've subscribed. |
| POST   | `/driver-verification/:id/reject`         | yes (admin)* | `{ reviewNote }` (required — shown to the driver) → marks `rejected`. Also notifies the driver. |

\* Same split as `/feedback` above: on the Workers deployment these are
gated by the shared `ADMIN_TOKEN` (the dashboard's reviewer types their
name into a plain text field, since there's no per-admin login there — it's
stored as `reviewed_by` for the record); on the Node backend they're gated
by `role === 'admin'` on the authenticated user, and `reviewed_by` is that
admin's own user id.

**Storage:** only an opaque key + mime type are stored in the database —
never the bytes. The Node backend writes photos to local disk
(`backend/data/driver-docs/`, gitignored); the Workers deployment stores
them in Workers KV (binding `DRIVER_DOCS`) rather than R2, since R2 isn't
enabled on this Cloudflare account (it needs a one-time dashboard opt-in) —
KV's 25MiB per-value limit is comfortably enough for a compressed ID photo,
and swapping to R2 later only touches `worker/src/lib/driverDocs.js`.

## Feedback

| Method | Path              | Auth              | Description                                                        |
|--------|--------------------|--------------------|------------------------------------------------------------------------|
| POST   | `/feedback`         | no (optional)      | `{ message, email?, page? }` → `201`. Unauthenticated by design — a pitch reader or someone who just installed the PWA needs to be able to leave feedback before ever creating an account. If a valid token is present, the submission is tagged with that user automatically. |
| GET    | `/feedback`         | yes (admin)*        | Recent submissions, newest first. Distinct from Safety Centre's login-gated `feedback` report category (`/safety/reports`), which is for account-holders reporting through the incident-report flow. |

\* On the Workers deployment this is `GET /feedback/list` gated by the same
`ADMIN_TOKEN` as the rest of `/admin` (see `worker/src/lib/adminAuth.js`);
on the Node backend it's `GET /feedback` gated by `role === 'admin'` on the
authenticated user (see `governance/audit-events` for the same pattern).

## AI Gateway (Genesis Assistant)

| Method | Path             | Auth | Description                                                        |
|--------|-------------------|------|------------------------------------------------------------------------|
| GET    | `/ai/status`       | no   | Whether Anthropic enrichment is configured                              |
| POST   | `/ai/assistant`     | no*  | Ask Genesis a question: `{ message }` → `{ source, reply, intent }`      |

Works with zero configuration using deterministic, transparent rule-based
answers. If `ANTHROPIC_API_KEY` is set, responses are enriched by the
Anthropic API with a graceful fallback on any failure.
