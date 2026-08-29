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
| POST   | `/users/register`     | no   | Create an account, returns `{ token, user }`   |
| POST   | `/users/login`        | no   | Log in, returns `{ token, user }`              |
| GET    | `/users/me`           | yes  | Current user + profile                         |
| PATCH  | `/users/me/profile`   | yes  | Update bio, preferences, Decision DNA weights  |
| POST   | `/users/forgot-password` | no | `{ email }` → generic message regardless of whether the account exists (avoids leaking which emails are registered). Emails a reset link via Resend if `RESEND_API_KEY` is configured; otherwise the link is only logged server-side. |
| POST   | `/users/reset-password`  | no | `{ token, newPassword }` → `{ token, user }` on success. The token is single-use, expires after 30 minutes, and only its SHA-256 hash is ever stored. |

## Journeys (Find / Offer)

| Method | Path                     | Auth  | Description                                             |
|--------|--------------------------|-------|-----------------------------------------------------------|
| POST   | `/journeys`              | yes   | Create an `offer` or `request` journey. Requests trigger matching and return `{ journey, matches }`. Offers may set `vehicleType` (`electric`\|`hybrid`\|`petrol`\|`diesel`\|`other`) — optional, used for the matching engine's environmental factor and for estimating impact once a booking completes. |
| GET    | `/journeys`              | no*   | List journeys. Query: `type`, `status`, `mine=true` (requires auth) |
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
    "proximity": { "score": 0.98, "weight": 0.35, "detail": "0.2 km average origin/destination gap" },
    "timing": { "score": 1, "weight": 0.3, "detail": "0 min apart on departure time" },
    "price": { "score": 1, "weight": 0.15, "detail": "..." },
    "preferences": { "score": 0.7, "weight": 0.15, "detail": "..." },
    "reliability": { "score": 0.8, "weight": 0.05, "detail": "..." },
    "environmental": { "score": 0.72, "weight": 0.08, "detail": "Would fill 75% of a hybrid vehicle's seats" }
  },
  "narrative": "Genesis rated this match 94/100. ..."
}
```

`environmental` scores how much of the offer vehicle's spare capacity the match would use, plus a bonus for lower-emission `vehicleType`s — it informs ranking only, and is separate from the estimated CO2e/fuel figures below (see [Environmental impact](#environmental-impact-estimated)).

## Bookings (state machine)

`REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED`
(any non-terminal state may move to `CANCELLED`).

| Method | Path                       | Auth | Description                                         |
|--------|----------------------------|------|--------------------------------------------------------|
| POST   | `/bookings`                | yes  | Create a booking against an `offer` journey             |
| GET    | `/bookings/mine`           | yes  | Bookings where you're the passenger or journey owner    |
| GET    | `/bookings/:id`            | yes  | Booking + journey detail                                |
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
| GET    | `/payments/methods`           | no   | Sandbox methods (`card`, `mobile_money`, `wallet`, `cash`), plus `{ stripe: { enabled, publishableKey } }` if Stripe is configured |
| POST   | `/payments`                   | yes  | Pay for a booking via a sandbox method: `{ bookingId, method }` |
| GET    | `/payments/booking/:bookingId`| yes  | Payment history for a booking                       |
| POST   | `/payments/stripe/intent`     | yes  | Start a real Stripe payment: `{ bookingId }` → `{ paymentId, clientSecret }` |
| POST   | `/payments/stripe/:paymentId/confirm` | yes | After the frontend confirms the card with Stripe directly, re-verifies the PaymentIntent server-side and captures |

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

Every method implements the same `authorize` → `capture` provider contract
(`backend/src/payments/providers.js`), so adding a real processor later means
adding one provider — no route changes.

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
