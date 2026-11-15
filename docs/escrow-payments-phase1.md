# Escrow-style payments & driver payouts — Phase 1 design

## Why

Today, `payments.js` only ever **authorizes and captures** the rider's fare (card, M-Pesa, cash, wallet-sandbox). Nothing in the codebase pays the driver. The platform's cut is computed and stored (`commission_rate` / `commission_amount` on `payments`, see `0004_commission.sql`), but it is never actually collected from a driver who gets paid in cash or directly by the rider — it just sits as a number for `GET /api/pro/revenue`'s reporting.

Alvin wants riders to pay into a holding step ("escrow") that only releases money to the driver once the trip is done, with the platform's commission taken out automatically. The concern raised: if the rider can pay the driver directly, the 10% commission is easy to dodge.

Full stored-value wallets (top-up, hold a balance, withdraw) are **out of scope for Phase 1** — in Kenya that's e-money and needs a Central Bank of Kenya licence. Phase 1 gets the "hold, then pay out automatically" behavior without us ever holding customer funds ourselves: the licensed provider (Safaricom for M-Pesa, Stripe) holds it, and we only move money between accounts we don't custody.

## Phase 1 scope

1. **Collection**: rider pays the full fare at booking via M-Pesa STK Push (to the platform's own Paybill/Till) or Stripe card — both already exist. No change to collection.
2. **Hold**: the payment sits `CAPTURED` against the booking until the trip is marked `COMPLETED`. This already happens today as a side effect of booking status being separate from payment status — Phase 1 makes the release conditional on it explicitly rather than incidental.
3. **Release**: once the **passenger confirms the trip is done** (not simply once someone taps "complete"), the system pays the driver **90%** (commission-adjusted) automatically:
   - M-Pesa: Safaricom B2C (Business-to-Customer) to the driver's phone.
   - Stripe: Stripe Connect transfer/payout to the driver's connected account.
   - Cash / `wallet` sandbox method: no money to move (driver already has it, or it's a sandbox no-op) — instead, the commission owed is recorded as a **debt** against the driver (see "Commission-bypass controls").
4. **Commission** is deducted before the driver ever sees the money for in-app rails (M-Pesa/Stripe) — the driver physically cannot receive more than 90%, because we only ever send 90%.
5. **The driver is told payment is secured the moment the rider pays** — before the trip even ends — so they know the 90% is coming without needing to trust the passenger. The actual money only moves after the passenger confirms, so a passenger can't be pressured into releasing funds while still mid-ride (Alvin's "avoid passengers being halfway their journey" concern).
6. Disputes, refunds, idempotency, reconciliation, failed payouts, auto-release safeguards, and abandoned trips are all first-class (below), not follow-ups.

## What does NOT change

- `providers.js`'s authorize/capture contract for the rider-side payment. Collection flow is untouched.
- Commission rate resolution (`commissionRateForBooking` in `payments.js`) — Pro Driver plan discount still applies.
- The booking state machine (`stateMachine.js`).

## New concept: Payout

A **payout** is the platform's half of the transaction: the money that moves from the platform's collecting account to the driver, net of commission, after a booking completes. It's the mirror image of `payments` (rider → platform) and deliberately kept as its own table rather than bolted onto `payments`, because its lifecycle, failure modes and provider calls are different (B2C/Connect, not STK/PaymentIntent).

### Schema — `worker/migrations/00NN_payouts.sql`

```sql
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,              -- 'mpesa_b2c' | 'stripe_connect' | 'manual' (cash/wallet — no transfer)
  gross_amount REAL NOT NULL,        -- the fare
  commission_amount REAL NOT NULL,   -- copied from payments.commission_amount at release time
  net_amount REAL NOT NULL,          -- gross - commission; what's actually sent (0 for 'manual')
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'HELD', -- HELD -> PENDING -> SENT -> CONFIRMED | FAILED (HELD/PENDING -> FAILED on dispute-before-release)
  release_at TEXT,                   -- when HELD is eligible to actually dispatch (confirmation time + dispute window)
  release_reason TEXT,               -- 'passenger_confirmed' | 'auto_released' | 'admin_forced'
  reference TEXT,                    -- Safaricom ConversationID / Stripe transfer id
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE, -- booking_id (one payout per completed booking, ever)
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_payouts_driver ON payouts(driver_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_release_at ON payouts(release_at);
```

`idempotency_key = booking_id` with a UNIQUE constraint is the real idempotency guard: the release trigger (below) can be invoked more than once (retry, race, admin re-run, cron sweep) and the `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING` makes every call after the first a no-op at the database level, not just in application logic.

Same migration adds confirmation-tracking columns to `bookings` (self-provisioned via `ALTER TABLE`, same pattern as `0004_commission.sql`):

```sql
ALTER TABLE bookings ADD COLUMN completed_by TEXT;             -- user id who called /:id/complete (driver or passenger)
ALTER TABLE bookings ADD COLUMN passenger_confirmed_at TEXT;   -- set only by the passenger's explicit confirmation
ALTER TABLE bookings ADD COLUMN auto_release_eligible_at TEXT; -- earliest the auto-release safeguard may fire (see below)
```

### Driver payout destination

Drivers need somewhere to receive money. Reuse the existing profile preferences pattern (`users.preferences.payment_method` already drives UI, per `bookings.js`'s `driverPaymentMethod`) rather than a new table:

- `profile.preferences.payout_mpesa_phone` — Kenyan MSISDN, validated with the existing `normalizeKenyanPhone()`.
- `profile.preferences.payout_stripe_account_id` — a Stripe **Connect Express** account id, created via Stripe's account-onboarding link the first time a driver opts into card payouts. (New, minimal addition: `POST /api/pro/payout/stripe/onboard` returns an Account Link URL; Stripe handles KYC, we never touch it.)

If a driver has configured neither, payouts queue as `PENDING` with `failure_reason = 'no_payout_destination'` and the driver gets a notification (reuses `notify.js`) telling them to set one up — this is the realistic failure mode for a brand-new driver completing their first trip before onboarding payouts.

## Driver payment-secured notification

Alvin's explicit ask: the driver should hear, as soon as the rider pays, that the money is secured and that 90% is coming — *not* have to wait and wonder until the trip ends. This is purely informational (no money moves yet) and fires from the same place every collection path already reports success:

- `payments.js`'s synchronous provider path (`POST /`, after `captureResult`), the Stripe `confirm` handler, the M-Pesa `callback`, and the M-Pesa status-poll fallback — i.e. every place that currently calls `recordAuditEvent(... 'payment.captured' ...)` — gains one more call: `notifyUser(db, env, journey.ownerId, { type: 'payment_secured', ... })` (reuses the existing `notifyUser` helper already imported in `bookings.js`; `payments.js` doesn't import it today, so that's a one-line addition).
- Message content: the fare, the computed net amount (`amount - commission_amount`, already available at capture time), and that it releases once the passenger confirms the trip is complete — e.g. *"KES 500 secured for your trip with Jane. KES 450 will be sent to your M-Pesa once the trip is marked complete."*
- No new table: this is a notification side-effect only, not a payout record (a payout row is still only created once the booking actually reaches the confirmed-complete state, so a trip that's paid for but later abandoned/cancelled before completion never gets an orphaned payout row — see "Abandoned trips" below).

## Release trigger

The key change from the original design above: **marking a trip "complete" and releasing the driver's money are two different things.** Today `bookings.js`'s `POST /:id/complete` (`transitionRoute('COMPLETED', {})`) can be called by *either* the driver or the passenger with no distinction — that's fine for ending the trip operationally (stops live tracking, lets both sides rate each other), but it must not by itself be what pays the driver, or a driver could tap "complete" while the passenger is still in the car and collect payment before the ride is actually over. Phase 1 splits these:

1. **Trip marked complete** (existing `/:id/complete`, unchanged as an endpoint) — either party can still call this; it now also stamps `completed_by = authUser.id`. This is "the ride is over" from an operations standpoint (ends tracking, triggers impact/funnel code as today).
2. **Passenger confirms completion** (new `POST /bookings/:id/confirm-completion`, passenger-only) — this is the *intended, primary* release trigger. If the booking isn't `COMPLETED` yet, confirming also completes it (handles "passenger taps confirm before the driver touches anything"). Sets `passenger_confirmed_at = now`, then schedules the payout: inserts the `payouts` row as `HELD` with `release_at = now + payout_dispute_window_minutes` (new platform setting, default short — e.g. 120 minutes) and `release_reason = 'passenger_confirmed'`.
3. **Auto-release safeguard** (passenger never confirms): the reconciliation cron (below) finds bookings that are `COMPLETED` but have no `passenger_confirmed_at`, where `completed_by` ≠ null, **and** where there's real corroborating evidence the trip is actually over — not just the driver's say-so a minute after starting. Corroboration is either (a) `liveLocations.js`/`tracking.js` shows the vehicle stationary near the journey's destination for a threshold time, or, if no live-location data exists for that trip, (b) a minimum elapsed time since the `IN_PROGRESS → COMPLETED` transition consistent with the journey's own distance/duration estimate (`impact.js` already estimates trip distance; a rough `duration ≈ distance / avg_speed` floor is enough — this only needs to rule out "marked complete 2 minutes after starting", not be precise). Once corroborated *and* `payout_auto_release_hours` (new platform setting, default e.g. 12h) has passed since completion with no passenger confirmation, the cron auto-confirms: same `payouts` row insert as above, but `release_reason = 'auto_released'`, `passenger_confirmed_at` stays null (so it's always visible in the data which trips were explicitly confirmed vs. auto-released). The dispute window still applies afterward — an auto-released trip isn't rushed out any faster than a confirmed one.
4. **Actual dispatch**: the same reconciliation cron (or, for the rare case release_at is already past at confirmation time because the window is 0, inline) finds `payouts` rows with `status = 'HELD'` and `release_at <= now`, re-checks that the booking has no `open`/`under_review` dispute filed against it, and only then calls `releasePayoutForBooking`'s dispatch step — flips `HELD → PENDING` and sends the M-Pesa B2C / Stripe transfer. A dispute filed inside the window flips the payout to `FAILED` with `failure_reason = 'disputed_before_release'` instead (see "Disputes & refunds interaction", updated below) — nothing is ever sent for a trip under active dispute.

`releasePayoutForBooking(db, env, booking)` (called by both the passenger-confirmation route and the cron):
1. Finds the booking's latest `CAPTURED` payment. If none (e.g. cash never confirmed, or trip somehow completed unpaid), records a `payout.skipped_unpaid` audit event and returns — no payout without a captured payment.
2. Checks the commission-bypass rules (below) before paying anything — blocks release if the driver is over their cash-debt threshold.
3. Inserts the `payouts` row as `HELD` (idempotent insert as above) if one doesn't already exist for this booking; if the dispatch step is being invoked separately (cron, once `release_at` has passed), it instead loads the existing row.
4. Dispatches by `payments.method`:
   - `mpesa` / `card_stripe` → real transfer, see below.
   - `cash` / `wallet` / `mobile_money` (non-mpesa sandbox) → `net_amount = 0`, `method = 'manual'`, status goes straight to `CONFIRMED` (nothing to send), but the **commission owed is still recorded** as driver debt (see below) since cash never passed through us.

A payout failure (provider error, no destination configured) **never blocks trip completion or confirmation** — those always succeed as pure status/DB updates; `releasePayoutForBooking`'s own errors are caught and logged as `payout.release_error` audit events, left for the cron to retry.

### M-Pesa B2C payout

New function in `worker/src/lib/mpesa.js`, mirroring `initiateStkPush`'s shape (same OAuth helper, same base URLs):

```js
export async function initiateB2C({ phone, amount, remarks, occasion, callbackUrl, timeoutUrl, config }) { ... }
```

Calls Safaricom's `/mpesa/b2c/v1/paymentrequest` with `InitiatorName`/`SecurityCredential` (new env vars: `MPESA_INITIATOR_NAME`, `MPESA_INITIATOR_PASSWORD` — encrypted into `SecurityCredential` with Safaricom's public cert per their docs) and `CommandID: 'BusinessPayment'`. Like STK Push, this *accepts* synchronously and resolves later via a callback (`ResultURL`) — same async pattern already used for collection, so the payouts table's `PENDING -> SENT -> CONFIRMED` states map directly onto "B2C request accepted" → "Safaricom confirms funds moved" → done.

New route: `POST /api/payments/mpesa/b2c-callback` (public, same forged-callback protection pattern as the existing `/mpesa/callback`: correlate by a `payoutId` query param embedded at dispatch time, double-checked against the stored `ConversationID` reference).

### Stripe Connect payout

New functions in `worker/src/lib/stripe.js`:

```js
export async function createTransfer({ amount, currency, destinationAccountId, metadata, secretKey }) { ... }
```

Uses Stripe Connect's **destination charges** model retrofitted onto the existing flow: since the rider's PaymentIntent was already created on the platform's own account (not a destination charge at collection time — collection code is unchanged per scope), release uses a separate `/v1/transfers` call crediting the driver's connected account from the platform's Stripe balance. This requires **Stripe Connect enabled on the platform account** and needs a **non-Kenya-registered Stripe entity** (per the existing constraint noted in `stripe.js` — Stripe doesn't operate merchant accounts in Kenya yet), so this path is realistically for a diaspora/international rollout, not the Kenya pilot. Transfers are synchronous (succeed or fail immediately), simpler than B2C's callback dance.

### Idempotency & reconciliation

- **Idempotency**: the `payouts.idempotency_key = booking_id` UNIQUE constraint (above) is the hard guarantee. The confirmation route, the cron's auto-release sweep, the cron's dispatch sweep, and a future manual "retry failed payouts" admin action all go through the same `releasePayoutForBooking`, so none of them can double-pay.
- **Reconciliation**: a scheduled Worker Cron job (`worker/wrangler.toml` already has no cron triggers yet — this is the first) runs e.g. every 5–10 minutes (tighter than a plain hourly sweep, since it's now also the auto-release and dispatch clock, not just a cleanup pass):
  - **Auto-release sweep**: `COMPLETED` bookings with no `passenger_confirmed_at`, corroborated as actually finished, past `payout_auto_release_hours` → auto-confirm per step 3 above.
  - **Dispatch sweep**: `payouts` with `status = 'HELD'` and `release_at <= now` and no open dispute on the booking → dispatch.
  - **Stuck-in-flight sweep**: `payouts` stuck `PENDING`/`SENT` for >15 minutes → re-polls Safaricom's B2C result (there's a query API, same idea as `queryStkPushStatus`) or Stripe's transfer status, resolves them.
  - **Missing-payout sweep**: `payments.status = 'CAPTURED'` bookings that are `COMPLETED` with **no** corresponding `payouts` row at all (a `.catch()`'d error upstream) → re-attempts release.
  - **Abandoned-trip sweep**: see below.
  - Surfaces anything still unresolved after a day to the admin dashboard (`GET /api/pro/revenue` gains a `stuckPayouts` count) rather than retrying forever.

### Abandoned trips

A trip that never reaches `COMPLETED` at all (driver or passenger just disappears mid-`IN_PROGRESS`, app killed, phone died) is the other half of "handling for trips abandoned partway" — distinct from the auto-release case above, which is about a *finished* trip nobody confirmed. Here the trip itself never finished:

- The abandoned-trip sweep (part of the same cron) finds bookings stuck in `IN_PROGRESS` for longer than a generous multiple of the journey's own estimated duration (reusing the same rough distance/duration estimate as the auto-release corroboration check, times e.g. 3x, plus a flat floor like 2 hours for very short estimated trips) with no further live-location pings.
- These are **not** auto-completed and **not** auto-paid — there's no reliable signal of what actually happened (trip finished and nobody tapped anything vs. genuinely abandoned vs. app crashed). They're written to the `anomaly_flags` table (below) with `kind = 'stale_in_progress_booking'` for manual admin review; the held payment is left exactly as it is (`CAPTURED`, no payout row yet) until an admin either force-completes it (if both sides confirm the trip did happen) or resolves it as a dispute/refund.
- No payout row ever gets created for a booking in this state, since payout creation only happens at passenger-confirmation or auto-release — both of which require `COMPLETED` first. This is also why driver notification ("payment secured") stays a notify-only side effect with no DB row of its own: a payment can be legitimately secured for a trip that's later abandoned, and that must never leave an orphaned payout record.

### Failed payouts

- `status = 'FAILED'` with `failure_reason` (`no_payout_destination`, `provider_error`, `insufficient_platform_balance`, ...) stays queryable per-driver at `GET /api/pro/payouts/me` (new, mirrors `driverBilling.js`'s `/me` pattern).
- Admin gets `POST /api/admin/payouts/:id/retry` to re-dispatch (goes through the same idempotent `releasePayoutForBooking` path, keyed by booking, so retrying a FAILED payout updates the existing row rather than creating a second one — the UNIQUE constraint is on booking_id, not status).
- A driver with a payout stuck FAILED for too long is a support/product problem, not something this design auto-escalates beyond the admin view above.

## Disputes & refunds interaction

`disputes.js`'s `resolve` already refunds the **rider's** payment (Stripe refund, or bookkeeping-only status flip for other methods — fixed in PR #15 per the existing comment). Phase 1 adds: if a payout has already been released (or is sitting `HELD`/queued) for that booking when a dispute resolves as `resolved_refunded`, the driver's share must be blocked, clawed back, or netted, otherwise the platform refunds the rider out of pocket while the driver keeps the payout.

Filing a dispute is also, independently of its eventual resolution, enough to **stop a `HELD` payout from ever dispatching** — the dispatch sweep's "no open dispute on the booking" check (above) means a dispute filed inside the window pre-empts release automatically, before anyone resolves anything:

- If `payouts.status` for that booking is `HELD` or `PENDING` → cancel it outright (set `status = 'FAILED'`, `failure_reason = 'disputed_before_release'`), nothing was ever sent.
- If already `SENT`/`CONFIRMED` → add the net amount to that driver's **commission-owed ledger** (same ledger as cash-trip debt below) as a negative adjustment, netted from their *next* payout rather than attempting a real B2C/Connect reversal (Safaricom B2C has no clean reversal API; this mirrors how real ride-hailing apps claw back driver balances for disputed trips).
- `disputes.js`'s resolve handler gains one call to a new `clawbackPayoutForDispute(db, dispute, payment)` alongside its existing `refundPayment` call.

## Commission-bypass controls

The core risk: driver and rider agree to settle outside the app (cash, or splitting a smaller "official" fare in-app and the rest in cash) to dodge the 10%. Controls, roughly in order of how directly they attack the problem:

1. **Cash trips accrue commission owed, not forgiven.** Every `cash`-method payment's `commission_amount` (already computed today, just never collected) is added to a per-driver running ledger (`driver_commission_ledger` table: `driver_id`, `amount_owed`, running balance via inserts, not a mutable column — append-only for auditability, same spirit as `audit.js`). Phase 1 reuses the `payouts` "manual" row from above as the ledger entry source — no separate write path.
2. **Netting.** Before dispatching any real M-Pesa/Stripe payout, `releasePayoutForBooking` first deducts the driver's outstanding ledger balance from `net_amount` (floor at 0, carry the remainder forward). A driver who's been taking cash trips sees their *next in-app payout* shrink until the debt is cleared — this is the actual collection mechanism, since we can't reach into a driver's M-Pesa account to pull cash-trip commission out directly.
3. **Booking block above a threshold.** New platform setting `cash_debt_block_threshold` (via the existing `platformSettings.js` key/value store, admin-editable like `commission_rate_pct`). `bookings.js`'s journey-owner-side actions (`confirm`, or booking creation against that driver's journey) check the driver's ledger balance and reject with a clear message once it crosses the threshold — same shape as the existing seat-availability check, just one more precondition.
4. **In-app perks gated to in-app-paid trips.** SOS/safety-case escalation (`safety.js`), trip records, ratings, and dispute filing (`disputes.js`) already key off `booking_id`/`payment_id` — no change needed to *allow* them, but the design explicitly calls out: don't add any new cash-trip perk (e.g. "driver insurance per trip" from `insurancePartners.js`, if that's ever trip-scoped) without checking payment method first, since generous cash-trip treatment undermines control #1's incentive.
5. **Faster payouts as the carrot.** Net payouts dispatch immediately on `COMPLETED` (not batched) specifically so going through the app beats waiting for cash — this is already true by construction of the design above, just calling it out as a deliberate choice, not an accident.
6. **Anomaly flags.** A lightweight nightly check (same Cron job as reconciliation) flags driver/rider pairs with a suspicious pattern: ≥N bookings in the last 30 days between the same two users where the booking was `CANCELLED` shortly after `CONFIRMED` (cancel right before the trip, suggesting they moved to cash) — query against `bookings` + `audit_log` timestamps, no new tracking needed. Written to a new `anomaly_flags` table (`subject_type`, `subject_id`, `kind`, `details_json`, `created_at`) surfaced on the admin dashboard, **not** auto-blocking — this is a lead for manual review, not an automated penalty, since false positives (e.g. genuinely cancelling and rebooking later) are easy.

## Implementation task breakdown

1. **Migration**: `00NN_payouts.sql` — `payouts` table (with `release_at`/`release_reason`), `driver_commission_ledger` table, `anomaly_flags` table, plus `bookings.completed_by` / `passenger_confirmed_at` / `auto_release_eligible_at` columns. Self-provision fallback in whichever route first needs them, per existing pattern.
2. **`worker/src/lib/mpesa.js`**: add `initiateB2C()` + a B2C status-query function, following `initiateStkPush`/`queryStkPushStatus`'s shape. New env vars in `wrangler.toml`: `MPESA_INITIATOR_NAME`, `MPESA_INITIATOR_PASSWORD` (or precomputed `SecurityCredential`).
3. **`worker/src/lib/stripe.js`**: add `createTransfer()`. Document the Connect + non-KE-entity prerequisite inline, same as the existing zero-decimal-currency comment style.
4. **New `worker/src/lib/payouts.js`**: `releasePayoutForBooking()`, `clawbackPayoutForDispute()`, ledger read/write helpers, the corroborated-arrival check (reusing `liveLocations.js`/`tracking.js`/`impact.js`'s distance estimate) — the core logic, kept out of `routes/` since it's called from `bookings.js`, `disputes.js`, and the cron.
5. **`worker/src/routes/bookings.js`**: stamp `completed_by` on `/:id/complete`; add new passenger-only `POST /:id/confirm-completion` that sets `passenger_confirmed_at` and schedules the `HELD` payout (non-blocking release call, per above); booking-creation/confirm guard against `cash_debt_block_threshold`.
6. **`worker/src/routes/disputes.js`**: wire the clawback call into `resolve`; dispute filing already blocks a `HELD` payout via the dispatch sweep's check, no extra code needed there beyond the booking/dispute lookup the sweep already does.
7. **`worker/src/routes/payments.js`**: new `POST /mpesa/b2c-callback` route (public, correlated by `payoutId`); add the payment-secured `notifyUser()` call to every existing capture success path (sync provider, Stripe confirm, M-Pesa callback, M-Pesa status poll).
8. **New `worker/src/routes/payouts.js`**: `GET /api/pro/payouts/me` (driver's own payout history + ledger balance), `POST /api/pro/payout/stripe/onboard` (Connect Express onboarding link), admin `POST /api/admin/payouts/:id/retry`, admin `GET /api/admin/payouts?status=` (mirrors `disputes.js`'s admin list pattern).
9. **`worker/src/routes/users.js`**: accept `payout_mpesa_phone` / `payout_stripe_account_id` in profile preferences (validate the phone with `normalizeKenyanPhone`).
10. **New platform settings** (via `platformSettings.js`): `payout_dispute_window_minutes`, `payout_auto_release_hours`, `cash_debt_block_threshold` — all admin-editable like `commission_rate_pct`.
11. **Cron**: add a `[triggers] crons = [...]` entry to `wrangler.toml` + a scheduled handler (new, since none exists today) running the auto-release, dispatch, stuck-in-flight, missing-payout, abandoned-trip, and anomaly-flag sweeps.
12. **Admin dashboard** (`driverBilling.js`'s `revenueAdmin` or a new route): surface `stuckPayouts` count, ledger balances, anomaly flags list, stale-in-progress-booking review queue.
13. **Frontend**: driver "payment secured" notification display; driver payout-destination settings screen; driver payout history view; passenger "confirm trip complete" action; admin payouts/anomalies/stale-bookings screen. (Scoped at a high level only — Phase 1's main investment is backend.)
14. Tests: idempotent release (double-trigger, confirm + cron racing), clawback on refund-after-release, dispute-blocks-dispatch, auto-release corroboration logic, cash-debt netting math, booking block at threshold, abandoned-trip flagging.

## Open questions for Alvin

- **Stripe Connect feasibility now**: since Stripe doesn't support Kenya-registered payout accounts, is Stripe payouts worth building in Phase 1 at all, or should Phase 1 be M-Pesa-only until there's a non-KE entity (e.g. for a future market)? Recommend: build the `payouts` table and dispatch logic method-agnostic as described, but defer the actual `createTransfer()` Stripe wiring to Phase 1b — most real trips will be M-Pesa anyway.
- **`cash_debt_block_threshold` default value**: needs a number Alvin is comfortable with (e.g. "block after 3 unpaid cash trips' worth of commission" vs. a flat KES amount).
- **Dispute/auto-release window defaults**: proposed 2-hour dispute window and 12-hour auto-release timeout balance "pay drivers fast" against "give a genuinely-mid-trip passenger room to dispute before cash moves" — Alvin should sanity-check both against how long Nairobi trips realistically run and how fast drivers expect to be paid.
- **B2C float**: Safaricom B2C payouts draw from the platform's own M-Pesa business float — Alvin needs to confirm the Paybill/Till account will carry enough float to cover same-trip payouts, since this is an operational/finance concern outside the code.
