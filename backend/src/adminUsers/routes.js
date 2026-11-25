import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { db } from '../db/connection.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

// Mirrors worker/src/routes/adminUsers.js — see that file for the full
// rationale on how "driver" / "passenger" are derived (no boolean role
// column exists in the schema).
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const BASE_SELECT = `
  SELECT
    u.id AS id, u.email AS email, u.full_name AS fullName, u.role AS role,
    u.status AS status, u.created_at AS createdAt,
    COALESCE(p.driver_verification_status, 'unverified') AS driverVerificationStatus,
    EXISTS (SELECT 1 FROM journeys j WHERE j.owner_id = u.id AND j.type = 'offer') AS hasOfferJourney,
    EXISTS (SELECT 1 FROM bookings b WHERE b.passenger_id = u.id) AS hasBooking
  FROM users u
  LEFT JOIN profiles p ON p.user_id = u.id
`;

function typeClause(type) {
  if (type === 'driver') {
    return `(EXISTS (SELECT 1 FROM journeys j WHERE j.owner_id = u.id AND j.type = 'offer') OR COALESCE(p.driver_verification_status, 'unverified') != 'unverified')`;
  }
  if (type === 'passenger') {
    return `EXISTS (SELECT 1 FROM bookings b WHERE b.passenger_id = u.id)`;
  }
  return null;
}

function buildWhere({ type, search }) {
  const clauses = [];
  const params = [];
  const tc = typeClause(type);
  if (tc) clauses.push(tc);
  if (search) {
    clauses.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

function toItem(r) {
  const driverVerificationStatus = r.driverVerificationStatus || 'unverified';
  return {
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    status: r.status,
    driverVerificationStatus,
    isDriver: !!r.hasOfferJourney || driverVerificationStatus !== 'unverified',
    isPassenger: !!r.hasBooking,
    createdAt: r.createdAt,
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const type = req.query.type;
    const search = (req.query.search || '').trim().slice(0, 128);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const { where, params } = buildWhere({ type, search });

    const items = db
      .prepare(`${BASE_SELECT} ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
      .map(toItem);

    const { n: total } = db
      .prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${where}`)
      .get(...params);

    res.json({ items, page, pageSize, total });
  })
);

router.get(
  '/export.csv',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const rows = db.prepare(`${BASE_SELECT} ORDER BY u.created_at DESC`).all();

    const header = ['id', 'full_name', 'email', 'role', 'driver_verification_status', 'is_passenger', 'created_at'];
    const lines = [header.join(',')];
    for (const row of rows) {
      const item = toItem(row);
      lines.push(
        [item.id, item.fullName, item.email, item.role, item.driverVerificationStatus, item.isPassenger ? 'yes' : 'no', item.createdAt]
          .map(csvEscape)
          .join(',')
      );
    }
    const csv = lines.join('\r\n') + '\r\n';
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="genesis-users-${date}.csv"`);
    res.send(csv);
  })
);
