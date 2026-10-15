import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { db } from '../db/connection.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

// Mirrors worker/src/routes/adminRides.js.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const type = req.query.type;
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
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

    const rows = db
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
      .all(...params, pageSize, offset);

    const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM journeys j ${where}`).get(...params);

    res.json({
      items: rows.map((r) => ({
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
      total,
    });
  })
);
