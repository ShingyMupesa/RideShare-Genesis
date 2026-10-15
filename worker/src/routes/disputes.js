import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { assertBookingAccess } from './messaging.js';
import { getJourneyById } from './journeys.js';
import { recordAuditEvent } from '../lib/audit.js';
import { refundPayment } from '../lib/stripe.js';

export const disputes = new Hono();

const CATEGORIES = ['fare_dispute', 'no_show', 'property_damage', 'conduct', 'other'];
const RESOLUTIONS = ['resolved_refunded', 'resolved_denied', 'resolved_other'];

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so the CREATE TABLE has to stay on one line — see
// tracking.js/driverVerification.js for the same pattern. A real migration
// (worker/migrations/0013_disputes.sql) covers fresh environments; this is
// the safety net for the already-existing production DB.
async function ensureDisputesTable(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS disputes (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, filed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, against_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, safety_case_id TEXT REFERENCES safety_cases(id) ON DELETE SET NULL, category TEXT NOT NULL, disputed_amount REAL, currency TEXT, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution_note TEXT, resolved_by TEXT, resolved_at TEXT, payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_disputes_booking ON disputes(booking_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status)');
}

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    filedBy: row.filed_by,
    againstUserId: row.against_user_id,
    safetyCaseId: row.safety_case_id,
    category: row.category,
    disputedAmount: row.disputed_amount,
    currency: row.currency,
    description: row.description,
    status: row.status,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    paymentId: row.payment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

disputes.post('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  await ensureDisputesTable(db);

  const body = await c.req.json().catch(() => ({}));
  const { bookingId, againstUserId, category, disputedAmount, description } = body;
  if (!bookingId) throw BadRequest('bookingId is required');
  if (!CATEGORIES.includes(category)) {
    throw BadRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (!description || !String(description).trim()) throw BadRequest('description is required');

  // Confirms the filer is the passenger or the journey owner on this
  // booking (throws NotFound/Forbidden otherwise).
  const booking = await assertBookingAccess(db, bookingId, authUser.id);
  const journey = await getJourneyById(db, booking.journeyId);
  const counterpartyId = authUser.id === booking.passengerId ? journey.ownerId : booking.passengerId;

  // Default currency/amount from the booking's most recent payment when the
  // filer doesn't supply one — most disputes are about a payment that
  // already happened, so this saves re-typing an amount already on file.
  // Still overridable (e.g. disputing only part of the fare).
  const latestPayment = await db
    .prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(bookingId)
    .first();

  const hasExplicitAmount = disputedAmount !== undefined && disputedAmount !== null && disputedAmount !== '';
  const finalAmount = hasExplicitAmount ? Number(disputedAmount) : latestPayment?.amount ?? null;
  const finalCurrency = (hasExplicitAmount && body.currency) || latestPayment?.currency || booking.currency;

  const id = newId('dispute');
  await db
    .prepare(
      `INSERT INTO disputes (id, booking_id, filed_by, against_user_id, category, disputed_amount, currency, description, payment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      bookingId,
      authUser.id,
      againstUserId || counterpartyId || null,
      category,
      finalAmount,
      finalCurrency,
      String(description).trim(),
      latestPayment?.id || null
    )
    .run();

  const dispute = deserialize(await db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    actorId: authUser.id,
    eventType: 'dispute.filed',
    entityType: 'dispute',
    entityId: id,
    metadata: { bookingId, category, againstUserId: dispute.againstUserId },
  });

  return c.json({ dispute }, 201);
});

disputes.get('/mine', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  await ensureDisputesTable(db);
  const { results } = await db
    .prepare('SELECT * FROM disputes WHERE filed_by = ? OR against_user_id = ? ORDER BY created_at DESC')
    .bind(authUser.id, authUser.id)
    .all();
  return c.json({ disputes: results.map(deserialize) });
});

disputes.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureDisputesTable(db);

  const status = c.req.query('status');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];

  const { results } = await db
    .prepare(`SELECT * FROM disputes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM disputes ${where}`)
    .bind(...params)
    .first();

  return c.json({
    items: results.map(deserialize),
    page,
    pageSize,
    total: totalRow?.n || 0,
  });
});

disputes.post('/:id/resolve', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureDisputesTable(db);

  const id = c.req.param('id');
  const dispute = await db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first();
  if (!dispute) throw NotFound('Dispute not found');

  const body = await c.req.json().catch(() => ({}));
  const { resolution, resolutionNote, resolvedBy } = body;
  if (!RESOLUTIONS.includes(resolution)) {
    throw BadRequest(`resolution must be one of: ${RESOLUTIONS.join(', ')}`);
  }

  let refundedPayment = null;
  if (resolution === 'resolved_refunded' && dispute.payment_id) {
    const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(dispute.payment_id).first();
    if (payment && payment.status !== 'REFUNDED') {
      // Stripe is the only method here with a real refund API to call —
      // cash/mobile_money/wallet/M-Pesa sandbox payments have none, so for
      // those this is bookkeeping-only: just flip the stored status to
      // reflect what actually happened operationally (e.g. cash handed back).
      if (payment.method === 'card_stripe' && payment.reference && c.env.STRIPE_SECRET_KEY) {
        try {
          await refundPayment({
            paymentIntentId: payment.reference,
            amount: payment.amount,
            currency: payment.currency,
            secretKey: c.env.STRIPE_SECRET_KEY,
          });
        } catch (err) {
          throw BadRequest(err.message || 'Stripe refund failed');
        }
      }
      await db
        .prepare('UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind('REFUNDED', payment.id)
        .run();
      refundedPayment = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(payment.id).first();
    }
  }

  await db
    .prepare(
      `UPDATE disputes SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .bind(resolution, resolutionNote || null, resolvedBy || null, id)
    .run();

  const updated = deserialize(await db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'dispute.resolved',
    entityType: 'dispute',
    entityId: id,
    metadata: { resolution, resolvedBy: resolvedBy || null, paymentId: dispute.payment_id || null },
  });

  if (refundedPayment) {
    await recordAuditEvent(db, {
      eventType: 'payment.refunded',
      entityType: 'payment',
      entityId: refundedPayment.id,
      metadata: {
        disputeId: id,
        method: refundedPayment.method,
        amount: refundedPayment.amount,
        currency: refundedPayment.currency,
      },
    });
  }

  return c.json({ dispute: updated, payment: refundedPayment });
});

export { ensureDisputesTable };
