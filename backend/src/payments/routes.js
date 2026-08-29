import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Payments from './repository.js';
import * as Bookings from '../bookings/repository.js';
import { getProvider, SUPPORTED_METHODS } from './providers.js';
import { recordAuditEvent } from '../governance/auditLog.js';

export const router = Router();

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
  res.json({ methods: SUPPORTED_METHODS });
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
