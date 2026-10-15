import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';

export const adminPayments = new Hono();

// Admin-wide payments list (today payments.js only has GET /booking/:id,
// scoped to one booking's own passenger) — paginated, filterable by
// status/currency. Never sums amounts across different currencies in any
// aggregate shown — the per-row amount is shown with its own currency,
// matching tracking.js's established precedent (grouped by currency,
// never a single mixed total).
adminPayments.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  const status = c.req.query('status');
  const currency = c.req.query('currency');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('p.status = ?');
    params.push(status);
  }
  if (currency) {
    clauses.push('p.currency = ?');
    params.push(currency.toUpperCase());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { results } = await db
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
    .bind(...params, pageSize, offset)
    .all();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM payments p ${where}`)
    .bind(...params)
    .first();

  // Per-currency totals for the currently-filtered set, shown as separate
  // stats rather than summed together.
  const totalsByCurrency = await db
    .prepare(
      `SELECT p.currency AS currency, COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS n
       FROM payments p ${where}
       GROUP BY p.currency
       ORDER BY total DESC`
    )
    .bind(...params)
    .all();

  return c.json({
    items: results.map((r) => ({
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
    total: totalRow?.n || 0,
    totalsByCurrency: (totalsByCurrency.results || []).map((r) => ({ currency: r.currency, total: r.total, count: r.n })),
  });
});
