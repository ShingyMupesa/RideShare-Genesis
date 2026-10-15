import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { db } from '../db/connection.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

// Mirrors worker/src/routes/adminPayments.js. Never sums amounts across
// different currencies in any aggregate shown — grouped by currency.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const status = req.query.status;
    const currency = req.query.currency;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const clauses = [];
    const params = [];
    if (status) {
      clauses.push('p.status = ?');
      params.push(status);
    }
    if (currency) {
      clauses.push('p.currency = ?');
      params.push(String(currency).toUpperCase());
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT
           p.id AS id, p.booking_id AS bookingId, p.payer_id AS payerId,
           p.method AS method, p.provider AS provider,
           p.amount AS amount, p.currency AS currency, p.status AS status,
           p.reference AS reference, p.created_at AS createdAt, p.updated_at AS updatedAt,
           u.full_name AS payerFullName, u.email AS payerEmail
         FROM payments p
         LEFT JOIN users u ON u.id = p.payer_id
         ${where}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset);

    const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM payments p ${where}`).get(...params);

    const totalsByCurrency = db
      .prepare(
        `SELECT p.currency AS currency, COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS n
         FROM payments p ${where}
         GROUP BY p.currency
         ORDER BY total DESC`
      )
      .all(...params);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        payerId: r.payerId,
        payerFullName: r.payerFullName,
        payerEmail: r.payerEmail,
        method: r.method,
        provider: r.provider,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reference: r.reference,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      page,
      pageSize,
      total,
      totalsByCurrency: totalsByCurrency.map((r) => ({ currency: r.currency, total: r.total, count: r.n })),
    });
  })
);
