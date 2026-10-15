import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

// The `disputes` table is provisioned by database/migrations/0012_disputes.sql
// (applied by runMigrations()), consistent with this backend's convention of
// relying on real migrations rather than self-provisioning (see
// governance/platformSettings.js's equivalent note).

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

export function createDispute({ bookingId, filedBy, againstUserId, category, disputedAmount, currency, description, paymentId }) {
  const id = newId('dispute');
  db.prepare(
    `INSERT INTO disputes (id, booking_id, filed_by, against_user_id, category, disputed_amount, currency, description, payment_id)
     VALUES (@id, @booking_id, @filed_by, @against_user_id, @category, @disputed_amount, @currency, @description, @payment_id)`
  ).run({
    id,
    booking_id: bookingId,
    filed_by: filedBy,
    against_user_id: againstUserId || null,
    category,
    disputed_amount: disputedAmount ?? null,
    currency: currency || null,
    description,
    payment_id: paymentId || null,
  });
  return getDisputeById(id);
}

export function getDisputeById(id) {
  return deserialize(db.prepare('SELECT * FROM disputes WHERE id = ?').get(id));
}

export function listDisputesForUser(userId) {
  return db
    .prepare('SELECT * FROM disputes WHERE filed_by = ? OR against_user_id = ? ORDER BY created_at DESC')
    .all(userId, userId)
    .map(deserialize);
}

export function listDisputes({ status, page = 1, pageSize = 50 } = {}) {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const offset = (page - 1) * pageSize;

  const items = db
    .prepare(`SELECT * FROM disputes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
    .map(deserialize);

  const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM disputes ${where}`).get(...params);

  return { items, total };
}

export function resolveDispute(id, { status, resolutionNote, resolvedBy }) {
  db.prepare(
    `UPDATE disputes SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(status, resolutionNote || null, resolvedBy || null, id);
  return getDisputeById(id);
}
