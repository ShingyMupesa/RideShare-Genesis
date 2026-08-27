import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { getProvider, SUPPORTED_METHODS } from '../lib/providers.js';
import { getBookingById } from './bookings.js';
import { recordAuditEvent } from '../lib/audit.js';

export const payments = new Hono();

async function createPayment(db, { bookingId, payerId, method, amount, currency }) {
  const id = newId('payment');
  await db
    .prepare(
      `INSERT INTO payments (id, booking_id, payer_id, method, provider, amount, currency, status)
       VALUES (?, ?, ?, ?, 'genesis_sandbox', ?, ?, 'PENDING')`
    )
    .bind(id, bookingId, payerId, method, amount, currency)
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

payments.get('/methods', (c) => c.json({ methods: SUPPORTED_METHODS }));

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

  const payment = await createPayment(db, { bookingId, payerId: authUser.id, method, amount: booking.totalPrice, currency: booking.currency });

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

payments.get('/booking/:bookingId', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const booking = await getBookingById(db, c.req.param('bookingId'));
  if (!booking) throw NotFound('Booking not found');
  if (booking.passengerId !== authUser.id) throw Forbidden('You do not have access to these payments');
  const { results } = await db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC').bind(c.req.param('bookingId')).all();
  return c.json({ payments: results });
});
