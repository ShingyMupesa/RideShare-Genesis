import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function createPayment({ bookingId, payerId, method, amount, currency, commissionRate = 0 }) {
  const id = newId('payment');
  const commissionAmount = Math.round(amount * commissionRate * 100) / 100;
  db.prepare(
    `INSERT INTO payments (id, booking_id, payer_id, method, provider, amount, currency, status, commission_rate, commission_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  ).run(id, bookingId, payerId, method, 'genesis_sandbox', amount, currency, commissionRate, commissionAmount);
  return getPaymentById(id);
}

export function getPaymentById(id) {
  return db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id);
}

export function listPaymentsForBooking(bookingId) {
  return db.prepare(`SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC`).all(bookingId);
}

export function updatePaymentStatus(id, status, reference) {
  db.prepare(
    `UPDATE payments SET status = ?, reference = COALESCE(?, reference), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(status, reference || null, id);
  return getPaymentById(id);
}
