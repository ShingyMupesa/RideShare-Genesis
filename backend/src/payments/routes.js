import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Payments from './repository.js';
import * as Bookings from '../bookings/repository.js';
import { getProvider, SUPPORTED_METHODS } from './providers.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import { createPaymentIntent, retrievePaymentIntent } from './stripe.js';
import { initiateStkPush, queryStkPushStatus, parseCallbackMetadata } from './mpesa.js';
import { mpesaLimiter } from '../middleware/rateLimit.js';

export const router = Router();

function mpesaConfigFromEnv() {
  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    environment: process.env.MPESA_ENV || 'sandbox',
  };
}

function mpesaEnabled() {
  const c = mpesaConfigFromEnv();
  return !!(c.consumerKey && c.consumerSecret && c.shortcode && c.passkey);
}

// Safaricom needs a real, publicly reachable HTTPS URL to call back to —
// never localhost. MPESA_CALLBACK_BASE_URL overrides for anything running
// behind a proxy/tunnel where the request's own Host header isn't the
// public one; otherwise this falls back to what the request says.
function callbackOrigin(req) {
  return process.env.MPESA_CALLBACK_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// The rider always pays the full fare; commission is the platform's cut of
// that fare, deducted from the driver's payout rather than added on top.
// Defaults to 0% (see .env.example) for the early-bird period — flipping
// PLATFORM_COMMISSION_PCT later applies only to payments made after the
// change, since the rate actually charged is stored per-payment.
function commissionRateFromEnv() {
  const pct = Number(process.env.PLATFORM_COMMISSION_PCT ?? 0);
  return Number.isFinite(pct) && pct > 0 ? pct / 100 : 0;
}

router.get('/methods', (req, res) => {
  res.json({
    methods: SUPPORTED_METHODS,
    // The publishable key is not secret by design (Stripe's own docs say
    // it's safe to expose client-side) — serving it here means the
    // frontend never hardcodes it, so rotating it is a config change only.
    stripe: process.env.STRIPE_SECRET_KEY
      ? { enabled: true, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null }
      : { enabled: false, publishableKey: null },
    // No client-side secret needed — the STK Push is initiated entirely
    // server-side, so the frontend just needs to know whether to offer it.
    mpesa: { enabled: mpesaEnabled() },
  });
});

// Initiates payment for a booking: authorizes, then immediately captures
// (V1 keeps the two-step provider contract but settles synchronously).
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, method } = req.body || {};
    if (!bookingId) throw BadRequest('bookingId is required');
    const provider = getProvider(method);
    if (!provider) throw BadRequest(`Unsupported payment method. Choose one of: ${SUPPORTED_METHODS.join(', ')}`);

    const booking = Bookings.getBookingById(bookingId);
    if (!booking) throw NotFound('Booking not found');
    if (booking.passengerId !== req.user.id) throw Forbidden('Only the passenger can pay for this booking');

    const payment = Payments.createPayment({
      bookingId,
      payerId: req.user.id,
      method,
      amount: booking.totalPrice,
      currency: booking.currency,
      commissionRate: commissionRateFromEnv(),
    });

    const authResult = await provider.authorize({ amount: booking.totalPrice, currency: booking.currency });
    if (!authResult.success) {
      const failed = Payments.updatePaymentStatus(payment.id, 'FAILED', authResult.reference);
      recordAuditEvent({ actorId: req.user.id, eventType: 'payment.failed', entityType: 'payment', entityId: payment.id, metadata: { bookingId, method } });
      return res.status(402).json({ payment: failed, message: authResult.message });
    }

    Payments.updatePaymentStatus(payment.id, 'AUTHORIZED', authResult.reference);
    const captureResult = await provider.capture({ amount: booking.totalPrice, currency: booking.currency });
    const captured = Payments.updatePaymentStatus(payment.id, captureResult.status, captureResult.reference);

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'payment.captured',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { bookingId, method, amount: booking.totalPrice, currency: booking.currency },
    });

    res.status(201).json({ payment: captured, message: captureResult.message });
  })
);

// Stripe doesn't fit the synchronous authorize/capture contract above — the
// card is collected client-side via Elements and may need 3D Secure, so
// this is a deliberately separate two-step flow instead of forcing it into
// the sandbox providers' shape.
router.post(
  '/stripe/intent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw BadRequest('Stripe is not configured on this server');

    const { bookingId } = req.body || {};
    if (!bookingId) throw BadRequest('bookingId is required');

    const booking = Bookings.getBookingById(bookingId);
    if (!booking) throw NotFound('Booking not found');
    if (booking.passengerId !== req.user.id) throw Forbidden('Only the passenger can pay for this booking');

    const payment = Payments.createPayment({
      bookingId,
      payerId: req.user.id,
      method: 'card_stripe',
      amount: booking.totalPrice,
      currency: booking.currency,
      commissionRate: commissionRateFromEnv(),
    });

    let intent;
    try {
      intent = await createPaymentIntent({ amount: booking.totalPrice, currency: booking.currency, bookingId, secretKey });
    } catch (err) {
      Payments.updatePaymentStatus(payment.id, 'FAILED', null);
      throw BadRequest(err.message || 'Could not start the Stripe payment');
    }

    Payments.updatePaymentStatus(payment.id, 'PENDING', intent.id);
    recordAuditEvent({ actorId: req.user.id, eventType: 'payment.stripe_intent_created', entityType: 'payment', entityId: payment.id, metadata: { bookingId } });

    res.status(201).json({ paymentId: payment.id, clientSecret: intent.client_secret });
  })
);

// Called after the frontend has confirmed the card with Stripe directly —
// this endpoint re-fetches the PaymentIntent from Stripe itself rather
// than trusting whatever status the client reports, since that report
// could be spoofed or the tab could close before it ever arrives.
router.post(
  '/stripe/:paymentId/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw BadRequest('Stripe is not configured on this server');

    const payment = Payments.getPaymentById(req.params.paymentId);
    if (!payment) throw NotFound('Payment not found');
    if (payment.payer_id !== req.user.id) throw Forbidden('You do not have access to this payment');
    if (!payment.reference) throw BadRequest('This payment was never started with Stripe');

    const intent = await retrievePaymentIntent(payment.reference, { secretKey });

    let nextStatus = payment.status;
    if (intent.status === 'succeeded') nextStatus = 'CAPTURED';
    else if (['canceled', 'requires_payment_method'].includes(intent.status)) nextStatus = 'FAILED';

    const updated = nextStatus !== payment.status ? Payments.updatePaymentStatus(payment.id, nextStatus, payment.reference) : payment;

    if (nextStatus === 'CAPTURED' && payment.status !== 'CAPTURED') {
      recordAuditEvent({
        actorId: req.user.id,
        eventType: 'payment.captured',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { bookingId: payment.booking_id, provider: 'stripe' },
      });
    }

    res.json({ payment: updated, stripeStatus: intent.status });
  })
);

// M-Pesa STK Push doesn't fit the synchronous authorize/capture contract
// either — Safaricom accepts the request immediately, then reports the
// real outcome later via an async callback (or a status poll), exactly
// like the Stripe PaymentIntent flow above but over Safaricom's own
// protocol instead of Stripe's.
router.post(
  '/mpesa/stk-push',
  requireAuth,
  mpesaLimiter,
  asyncHandler(async (req, res) => {
    const config = mpesaConfigFromEnv();
    if (!mpesaEnabled()) throw BadRequest('M-Pesa is not configured on this server');

    const { bookingId, phone } = req.body || {};
    if (!bookingId) throw BadRequest('bookingId is required');
    if (!phone) throw BadRequest('phone is required');

    const booking = Bookings.getBookingById(bookingId);
    if (!booking) throw NotFound('Booking not found');
    if (booking.passengerId !== req.user.id) throw Forbidden('Only the passenger can pay for this booking');
    if (booking.currency !== 'KES') throw BadRequest('M-Pesa only supports payments priced in KES');

    const payment = Payments.createPayment({
      bookingId,
      payerId: req.user.id,
      method: 'mpesa',
      amount: booking.totalPrice,
      currency: booking.currency,
      commissionRate: commissionRateFromEnv(),
    });

    let stk;
    try {
      stk = await initiateStkPush({
        phone,
        amount: booking.totalPrice,
        accountReference: bookingId,
        transactionDesc: 'Genesis ride',
        callbackUrl: `${callbackOrigin(req)}/api/payments/mpesa/callback?paymentId=${payment.id}`,
        config,
      });
    } catch (err) {
      Payments.updatePaymentStatus(payment.id, 'FAILED', null);
      throw BadRequest(err.message || 'Could not start the M-Pesa payment');
    }

    Payments.updatePaymentStatus(payment.id, 'PENDING', stk.checkoutRequestId);
    recordAuditEvent({ actorId: req.user.id, eventType: 'payment.mpesa_stk_pushed', entityType: 'payment', entityId: payment.id, metadata: { bookingId } });

    res.status(201).json({ paymentId: payment.id, customerMessage: stk.customerMessage });
  })
);

// Public — Safaricom calls this directly, with no auth header. Correlated
// back to a specific payment via the paymentId embedded in the callback
// URL at STK-push time, then double-checked against the CheckoutRequestID
// stored as that payment's reference — a forged callback would have to
// guess both a real paymentId and its matching (long, Safaricom-generated)
// CheckoutRequestID to do anything. Always acknowledges with Safaricom's
// expected {ResultCode:0} shape regardless of what happened on our side —
// otherwise Safaricom just keeps retrying.
router.post(
  '/mpesa/callback',
  asyncHandler(async (req, res) => {
    const ack = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const paymentId = req.query.paymentId;
    const stkCallback = req.body?.Body?.stkCallback;
    if (!paymentId || !stkCallback) return ack();

    const payment = Payments.getPaymentById(paymentId);
    if (!payment || payment.reference !== stkCallback.CheckoutRequestID) return ack();
    if (payment.status !== 'PENDING') return ack(); // already resolved (e.g. via a status poll) — don't double-process

    if (stkCallback.ResultCode === 0) {
      const meta = parseCallbackMetadata(stkCallback.CallbackMetadata?.Item);
      Payments.updatePaymentStatus(payment.id, 'CAPTURED', payment.reference);
      recordAuditEvent({
        eventType: 'payment.captured',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { bookingId: payment.booking_id, provider: 'mpesa', ...meta },
      });
    } else {
      Payments.updatePaymentStatus(payment.id, 'FAILED', payment.reference);
      recordAuditEvent({
        eventType: 'payment.failed',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { bookingId: payment.booking_id, provider: 'mpesa', resultDesc: stkCallback.ResultDesc },
      });
    }

    return ack();
  })
);

// Polling fallback for when the callback above is slow or never arrives
// (common in Safaricom's sandbox) — re-asks Safaricom for the truth rather
// than trusting anything the client claims.
router.get(
  '/mpesa/:paymentId/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payment = Payments.getPaymentById(req.params.paymentId);
    if (!payment) throw NotFound('Payment not found');
    if (payment.payer_id !== req.user.id) throw Forbidden('You do not have access to this payment');

    if (payment.status !== 'PENDING' || !payment.reference) {
      return res.json({ payment });
    }

    const result = await queryStkPushStatus({ checkoutRequestId: payment.reference, config: mpesaConfigFromEnv() });
    if (result.pending) return res.json({ payment });

    const nextStatus = result.success ? 'CAPTURED' : 'FAILED';
    const updated = Payments.updatePaymentStatus(payment.id, nextStatus, payment.reference);
    if (nextStatus === 'CAPTURED') {
      recordAuditEvent({
        actorId: req.user.id,
        eventType: 'payment.captured',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { bookingId: payment.booking_id, provider: 'mpesa' },
      });
    }
    res.json({ payment: updated, resultDesc: result.resultDesc });
  })
);

router.get(
  '/booking/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = Bookings.getBookingById(req.params.bookingId);
    if (!booking) throw NotFound('Booking not found');
    if (booking.passengerId !== req.user.id) throw Forbidden('You do not have access to these payments');
    const payments = Payments.listPaymentsForBooking(req.params.bookingId);
    res.json({ payments });
  })
);
