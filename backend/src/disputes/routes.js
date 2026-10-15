import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Disputes from './repository.js';
import * as Payments from '../payments/repository.js';
import { assertBookingAccess } from '../messaging/routes.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import { refundPayment } from '../payments/stripe.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

const CATEGORIES = ['fare_dispute', 'no_show', 'property_damage', 'conduct', 'other'];
const RESOLUTIONS = ['resolved_refunded', 'resolved_denied', 'resolved_other'];

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, againstUserId, category, disputedAmount, description } = req.body || {};
    if (!bookingId) throw BadRequest('bookingId is required');
    if (!CATEGORIES.includes(category)) {
      throw BadRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
    if (!description || !String(description).trim()) throw BadRequest('description is required');

    const { booking, journey } = await assertBookingAccess(bookingId, req.user.id);
    const counterpartyId = req.user.id === booking.passengerId ? journey.ownerId : booking.passengerId;

    // Default currency/amount from the booking's most recent payment when the
    // filer doesn't supply one — most disputes are about a payment that
    // already happened, so this saves re-typing an amount already on file.
    const payments = Payments.listPaymentsForBooking(bookingId);
    const latestPayment = payments[0] || null;

    const hasExplicitAmount = disputedAmount !== undefined && disputedAmount !== null && disputedAmount !== '';
    const finalAmount = hasExplicitAmount ? Number(disputedAmount) : latestPayment?.amount ?? null;
    const finalCurrency = (hasExplicitAmount && req.body.currency) || latestPayment?.currency || booking.currency;

    const dispute = Disputes.createDispute({
      bookingId,
      filedBy: req.user.id,
      againstUserId: againstUserId || counterpartyId || null,
      category,
      disputedAmount: finalAmount,
      currency: finalCurrency,
      description: String(description).trim(),
      paymentId: latestPayment?.id || null,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'dispute.filed',
      entityType: 'dispute',
      entityId: dispute.id,
      metadata: { bookingId, category, againstUserId: dispute.againstUserId },
    });

    res.status(201).json({ dispute });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ disputes: Disputes.listDisputesForUser(req.user.id) });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const status = req.query.status || undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const { items, total } = Disputes.listDisputes({ status, page, pageSize });
    res.json({ items, page, pageSize, total });
  })
);

router.post(
  '/:id/resolve',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const dispute = Disputes.getDisputeById(req.params.id);
    if (!dispute) throw NotFound('Dispute not found');

    const { resolution, resolutionNote, resolvedBy } = req.body || {};
    if (!RESOLUTIONS.includes(resolution)) {
      throw BadRequest(`resolution must be one of: ${RESOLUTIONS.join(', ')}`);
    }

    let refundedPayment = null;
    if (resolution === 'resolved_refunded' && dispute.paymentId) {
      const payment = Payments.getPaymentById(dispute.paymentId);
      if (payment && payment.status !== 'REFUNDED') {
        // Stripe is the only method here with a real refund API to call —
        // cash/mobile_money/wallet/M-Pesa sandbox payments have none, so for
        // those this is bookkeeping-only: just flip the stored status to
        // reflect what actually happened operationally (e.g. cash handed
        // back).
        if (payment.method === 'card_stripe' && payment.reference && process.env.STRIPE_SECRET_KEY) {
          try {
            await refundPayment({
              paymentIntentId: payment.reference,
              amount: payment.amount,
              currency: payment.currency,
              secretKey: process.env.STRIPE_SECRET_KEY,
            });
          } catch (err) {
            throw BadRequest(err.message || 'Stripe refund failed');
          }
        }
        refundedPayment = Payments.updatePaymentStatus(payment.id, 'REFUNDED', payment.reference);
      }
    }

    const updated = Disputes.resolveDispute(req.params.id, { status: resolution, resolutionNote, resolvedBy });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'dispute.resolved',
      entityType: 'dispute',
      entityId: dispute.id,
      metadata: { resolution, resolvedBy: resolvedBy || null, paymentId: dispute.paymentId || null },
    });

    if (refundedPayment) {
      recordAuditEvent({
        actorId: req.user.id,
        eventType: 'payment.refunded',
        entityType: 'payment',
        entityId: refundedPayment.id,
        metadata: {
          disputeId: dispute.id,
          method: refundedPayment.method,
          amount: refundedPayment.amount,
          currency: refundedPayment.currency,
        },
      });
    }

    res.json({ dispute: updated, payment: refundedPayment });
  })
);
