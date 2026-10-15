import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';

export const adminRides = new Hono();

// Paginated list of journeys (both `offer` and `request`) with the
// owner's name/email for a human-readable table — same pagination
// convention as disputes.js: { items, page, pageSize, total }.
adminRides.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  const type = c.req.query('type'); // offer | request
  const status = c.req.query('status');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  const clauses = [];
  const params = [];
  if (type) {
    clauses.push('j.type = ?');
    params.push(type);
  }
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { results } = await db
    .prepare(
      `SELECT
         j.id AS id, j.type AS type,
         j.origin_label AS originLabel, j.destination_label AS destinationLabel,
         j.departure_time AS departureTime, j.price_per_seat AS pricePerSeat, j.currency AS currency,
         j.seats_total AS seatsTotal, j.seats_available AS seatsAvailable,
         j.status AS status, j.created_at AS createdAt,
         u.id AS ownerId, u.full_name AS ownerFullName, u.email AS ownerEmail
       FROM journeys j
       JOIN users u ON u.id = j.owner_id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, pageSize, offset)
    .all();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM journeys j ${where}`)
    .bind(...params)
    .first();

  return c.json({
    items: results.map((r) => ({
      id: r.id,
      type: r.type,
      originLabel: r.originLabel,
      destinationLabel: r.destinationLabel,
      departureTime: r.departureTime,
      pricePerSeat: r.pricePerSeat,
      currency: r.currency,
      seatsTotal: r.seatsTotal,
      seatsAvailable: r.seatsAvailable,
      status: r.status,
      createdAt: r.createdAt,
      owner: { id: r.ownerId, fullName: r.ownerFullName, email: r.ownerEmail },
    })),
    page,
    pageSize,
    total: totalRow?.n || 0,
  });
});
