import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { getProvider, SUPPORTED_METHODS } from '../lib/providers.js';
import { getBookingById } from './bookings.js';
import { recordAuditEvent } from '../lib/audit.js';
import { createPaymentIntent, retrievePaymentIntent } from '../lib/stripe.js';
import { initiateStkPush, queryStkPushStatus, parseCallbackMetadata } from '../lib/mpesa.js';
import { mpesaLimiter } from '../lib/rateLimit.js';

export const payments = new Hono();

function mpesaConfigFromEnv(env) {
  return {
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortcode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    environment: env.MPESA_ENV || 'sandbox',
  };
}

function mpesaEnabled(env) {
  const c = mpesaConfigFromEnv(env);
  return !!(c.consumerKey && c.consumerSecret && c.shortcode && c.passkey);
}

// Safaricom needs a real, publicly reachable HTTPS URL to call back to.
// MPESA_CALLBACK_BASE_URL overrides for anything unusual; otherwise the
// Worker's own request URL already carries its real public origin.
function callbackOrigin(c) {
  return c.env.MPESA_CALLBACK_BASE_URL || new URL(c.req.url).origin;
}

// payments predates the commission columns; self-provision them the same
// way tracking.js does for page_events, so this works against the existing
// production table without a separate migration step. ADD COLUMN isn't
// idempotent in SQLite/D1, so a "duplicate column" error means it's already
// there — anything else is a real failure and should surface.
let columnsEnsured = false;
async function ensureCommissionColumns(db) {
  if (columnsEnsured) return;
  for (const stmt of [
    `ALTER TABLE payments ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0`,
  ]) {
    try {
      await db.exec(stmt);
    } catch (err) {
      if (!/duplicate column/i.test(err.message || '')) throw err;
    }
  }
  columnsEnsured = true;
}

// The rider always pays the full fare; commission is the platform's cut of
// that fare, deducted from the driver's payout rather than added on top.
// Defaults to 0% (see wrangler.toml) for the early-bird period — flipping
// PLATFORM_COMMISSION_PCT later applies only to payments made after the
// change, since the rate actually charged is stored per-payment.
function commissionRateFromEnv(env) {
  const pct = Number(env.PLATFORM_COMMISSION_PCT ?? 0);
  return Number.isFinite(pct) && pct > 0 ? pct / 100 : 0;
}

async function createPayment(db, { bookingId, payerId, method, amount, currency, commissionRate }) {
  const id = newId('payment');
  const commissionAmount = Math.round(amount * commissionRate * 100) / 100;
  await db
    .prepare(
      `INSERT INTO payments (id, booking_id, payer_id, method, provider, amount, currency, status, commission_rate, commission_amount)
       VALUES (?, ?, ?, ?, 'genesis_sandbox', ?, ?, 'PENDING', ?, ?)`
    )
    .bind(id, bookingId, payerId, method, amount, currency, commissionRate, commissionAmount)
    .run();
  return db.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
}

async function updatePaymentStatus(db, id, status, reference) {
  await db
    .prepare('UPDATE payments SET status = ?, reference = COALESCE(?, reference), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, reference || null, id)
    .run();
  return db.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
}

payments.get('/methods', (c) =>
  c.json({
    methods: SUPPORTED_METHODS,
    // The publishable key is not secret by design (Stripe's own docs say
    // it's safe to expose client-side) — serving it here means the
    // frontend never hardcodes it, so rotating it is a config change only.
    stripe: c.env.STRIPE_SECRET_KEY
      ? { enabled: true, publishableKey: c.env.STRIPE_PUBLISHABLE_KEY || null }
      : { enabled: false, publishableKey: null },
    // No client-side secret needed — the STK Push is initiated entirely
    // server-side, so the frontend just needs to know whether to offer it.
    mpesa: { enabled: mpesaEnabled(c.env) },
  })
);

payments.post('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { bookingId, method } = body;
  if (!bookingId) throw BadRequest('bookingId is required');
  const provider = getProvider(method);
  if (!provider) throw BadRequest(`Unsupported payment method. Choose one of: ${SUPPORTED_METHODS.join(', ')}`);

  const booking = await getBookingById(db, bookingId);
  if (!booking) throw NotFound('Booking not found');
  if (booking.passengerId !== authUser.id) throw Forbidden('Only the passenger can pay for this booking');

  await ensureCommissionColumns(db);
  const commissionRate = commissionRateFromEnv(c.env);
  const payment = await createPayment(db, {
    bookingId,
    payerId: authUser.id,
    method,
    amount: booking.totalPrice,
    currency: booking.currency,
    commissionRate,
  });

  const authResult = await provider.authorize({ amount: booking.totalPrice, currency: booking.currency });
  if (!authResult.success) {
    const failed = await updatePaymentStatus(db, payment.id, 'FAILED', authResult.reference);
    await recordAuditEvent(db, { actorId: authUser.id, eventType: 'payment.failed', entityType: 'payment', entityId: payment.id, metadata: { bookingId, method } });
    return c.json({ payment: failed, message: authResult.message }, 402);
  }

  await updatePaymentStatus(db, payment.id, 'AUTHORIZED', authResult.reference);
  const captureResult = await provider.capture({ amount: booking.totalPrice, currency: booking.currency });
  const captured = await updatePaymentStatus(db, payment.id, captureResult.status, captureResult.reference);

  await recordAuditEvent(db, {
    actorId: authUser.id,
    eventType: 'payment.captured',
    entityType: 'payment',
    entityId: payment.id,
    metadata: { bookingId, method, amount: booking.totalPrice, currency: booking.currency },
  });

  return c.json({ payment: captured, message: captureResult.message }, 201);
});

// Stripe doesn't fit the synchronous authorize/capture contract above — the
// card is collected client-side via Elements and may need 3D Secure, so
// this is a deliberately separate two-step flow instead of forcing it into
// the sandbox providers' shape.
payments.post('/stripe/intent', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const secretKey = c.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw BadRequest('Stripe is not configured on this server');

  const body = await c.req.json().catch(() => ({}));
  const { bookingId } = body;
  if (!bookingId) throw BadRequest('bookingId is required');

  const booking = await getBookingById(db, bookingId);
  if (!booking) throw NotFound('Booking not found');
  if (booking.passengerId !== authUser.id) throw Forbidden('Only the passenger can pay for this booking');

  await ensureCommissionColumns(db);
  const payment = await createPayment(db, {
    bookingId,
    payerId: authUser.id,
    method: 'card_stripe',
    amount: booking.totalPrice,
    currency: booking.currency,
    commissionRate: commissionRateFromEnv(c.env),
  });

  let intent;
  try {
    intent = await createPaymentIntent({ amount: booking.totalPrice, currency: booking.currency, bookingId, secretKey });
  } catch (err) {
    await updatePaymentStatus(db, payment.id, 'FAILED', null);
    throw BadRequest(err.message || 'Could not start the Stripe payment');
  }

  await updatePaymentStatus(db, payment.id, 'PENDING', intent.id);
  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'payment.stripe_intent_created', entityType: 'payment', entityId: payment.id, metadata: { bookingId } });

  return c.json({ paymentId: payment.id, clientSecret: intent.client_secret }, 201);
});

// Called after the frontend has confirmed the card with Stripe directly —
// this endpoint re-fetches the PaymentIntent from Stripe itself rather
// than trusting whatever status the client reports, since that report
// could be spoofed or the tab could close before it ever arrives.
payments.post('/stripe/:paymentId/confirm', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const secretKey = c.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw BadRequest('Stripe is not configured on this server');

  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(c.req.param('paymentId')).first();
  if (!payment) throw NotFound('Payment not found');
  if (payment.payer_id !== authUser.id) throw Forbidden('You do not have access to this payment');
  if (!payment.reference) throw BadRequest('This payment was never started with Stripe');

  const intent = await retrievePaymentIntent(payment.reference, { secretKey });

  let nextStatus = payment.status;
  if (intent.status === 'succeeded') nextStatus = 'CAPTURED';
  else if (['canceled', 'requires_payment_method'].includes(intent.status)) nextStatus = 'FAILED';

  const updated = nextStatus !== payment.status ? await updatePaymentStatus(db, payment.id, nextStatus, payment.reference) : payment;

  if (nextStatus === 'CAPTURED' && payment.status !== 'CAPTURED') {
    await recordAuditEvent(db, {
      actorId: authUser.id,
      eventType: 'payment.captured',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { bookingId: payment.booking_id, provider: 'stripe' },
    });
  }

  return c.json({ payment: updated, stripeStatus: intent.status });
});

// M-Pesa STK Push doesn't fit the synchronous authorize/capture contract
// either — Safaricom accepts the request immediately, then reports the
// real outcome later via an async callback (or a status poll), exactly
// like the Stripe PaymentIntent flow above but over Safaricom's own
// protocol instead of Stripe's.
payments.post('/mpesa/stk-push', requireAuth, mpesaLimiter, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  if (!mpesaEnabled(c.env)) throw BadRequest('M-Pesa is not configured on this server');

  const body = await c.req.json().catch(() => ({}));
  const { bookingId, phone } = body;
  if (!bookingId) throw BadRequest('bookingId is required');
  if (!phone) throw BadRequest('phone is required');

  const booking = await getBookingById(db, bookingId);
  if (!booking) throw NotFound('Booking not found');
  if (booking.passengerId !== authUser.id) throw Forbidden('Only the passenger can pay for this booking');
  if (booking.currency !== 'KES') throw BadRequest('M-Pesa only supports payments priced in KES');

  await ensureCommissionColumns(db);
  const payment = await createPayment(db, {
    bookingId,
    payerId: authUser.id,
    method: 'mpesa',
    amount: booking.totalPrice,
    currency: booking.currency,
    commissionRate: commissionRateFromEnv(c.env),
  });

  let stk;
  try {
    stk = await initiateStkPush({
      phone,
      amount: booking.totalPrice,
      accountReference: bookingId,
      transactionDesc: 'Genesis ride',
      callbackUrl: `${callbackOrigin(c)}/api/payments/mpesa/callback?paymentId=${payment.id}`,
      config: mpesaConfigFromEnv(c.env),
    });
  } catch (err) {
    await updatePaymentStatus(db, payment.id, 'FAILED', null);
    throw BadRequest(err.message || 'Could not start the M-Pesa payment');
  }

  await updatePaymentStatus(db, payment.id, 'PENDING', stk.checkoutRequestId);
  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'payment.mpesa_stk_pushed', entityType: 'payment', entityId: payment.id, metadata: { bookingId } });

  return c.json({ paymentId: payment.id, customerMessage: stk.customerMessage }, 201);
});

// Public — Safaricom calls this directly, with no auth header. Correlated
// back to a specific payment via the paymentId embedded in the callback
// URL at STK-push time, then double-checked against the CheckoutRequestID
// stored as that payment's reference — a forged callback would have to
// guess both a real paymentId and its matching (long, Safaricom-generated)
// CheckoutRequestID to do anything. Always acknowledges with Safaricom's
// expected {ResultCode:0} shape regardless of what happened on our side —
// otherwise Safaricom just keeps retrying.
payments.post('/mpesa/callback', async (c) => {
  const db = c.env.DB;
  const ack = () => c.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const paymentId = c.req.query('paymentId');
  const body = await c.req.json().catch(() => ({}));
  const stkCallback = body?.Body?.stkCallback;
  if (!paymentId || !stkCallback) return ack();

  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();
  if (!payment || payment.reference !== stkCallback.CheckoutRequestID) return ack();
  if (payment.status !== 'PENDING') return ack(); // already resolved (e.g. via a status poll) — don't double-process

  if (stkCallback.ResultCode === 0) {
    const meta = parseCallbackMetadata(stkCallback.CallbackMetadata?.Item);
    await updatePaymentStatus(db, payment.id, 'CAPTURED', payment.reference);
    await recordAuditEvent(db, {
      eventType: 'payment.captured',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { bookingId: payment.booking_id, provider: 'mpesa', ...meta },
    });
  } else {
    await updatePaymentStatus(db, payment.id, 'FAILED', payment.reference);
    await recordAuditEvent(db, {
      eventType: 'payment.failed',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { bookingId: payment.booking_id, provider: 'mpesa', resultDesc: stkCallback.ResultDesc },
    });
  }

  return ack();
});

// Polling fallback for when the callback above is slow or never arrives
// (common in Safaricom's sandbox) — re-asks Safaricom for the truth rather
// than trusting anything the client claims.
payments.get('/mpesa/:paymentId/status', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(c.req.param('paymentId')).first();
  if (!payment) throw NotFound('Payment not found');
  if (payment.payer_id !== authUser.id) throw Forbidden('You do not have access to this payment');

  if (payment.status !== 'PENDING' || !payment.reference) {
    return c.json({ payment });
  }

  const result = await queryStkPushStatus({ checkoutRequestId: payment.reference, config: mpesaConfigFromEnv(c.env) });
  if (result.pending) return c.json({ payment });

  const nextStatus = result.success ? 'CAPTURED' : 'FAILED';
  const updated = await updatePaymentStatus(db, payment.id, nextStatus, payment.reference);
  if (nextStatus === 'CAPTURED') {
    await recordAuditEvent(db, {
      actorId: authUser.id,
      eventType: 'payment.captured',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { bookingId: payment.booking_id, provider: 'mpesa' },
    });
  }
  return c.json({ payment: updated, resultDesc: result.resultDesc });
});

payments.get('/booking/:bookingId', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const booking = await getBookingById(db, c.req.param('bookingId'));
  if (!booking) throw NotFound('Booking not found');
  if (booking.passengerId !== authUser.id) throw Forbidden('You do not have access to these payments');
  const { results } = await db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC').bind(c.req.param('bookingId')).all();
  return c.json({ payments: results });
});
