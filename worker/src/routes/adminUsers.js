import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';

export const adminUsers = new Hono();

// Quotes a field only when it actually needs it (contains a comma, quote,
// or newline), doubling any embedded quotes — the standard CSV escaping
// rule. No dependency needed for a column count this small.
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// The users/profiles schema has no boolean "is driver" / "is passenger"
// column (see worker/migrations/0001_init.sql, 0009_driver_verification.sql)
// — role is only ever 'member' | 'admin'. So "driver" and "passenger" are
// derived from behaviour, not stored directly, and are not mutually
// exclusive (a driver can also book rides as a passenger):
//   driver    = has ever posted an `offer` journey, OR has started/completed
//               driver verification (profiles.driver_verification_status
//               isn't the default 'unverified')
//   passenger = has ever made a booking
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

// Backs the Users, Drivers, and Passengers admin screens — the latter two
// just pass ?type=driver / ?type=passenger. Response shape matches the
// disputes.js / monetization convention: { items, page, pageSize, total }.
adminUsers.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  const type = c.req.query('type');
  const search = (c.req.query('search') || '').trim().slice(0, 128);
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  const { where, params } = buildWhere({ type, search });

  const { results } = await db
    .prepare(`${BASE_SELECT} ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${where}`)
    .bind(...params)
    .first();

  return c.json({
    items: results.map(toItem),
    page,
    pageSize,
    total: totalRow?.n || 0,
  });
});

// Streamed as a single CSV response (not paginated — this is an export, the
// whole point is to get everything in one file). Admin-only.
adminUsers.get('/export.csv', requireAdmin, async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`${BASE_SELECT} ORDER BY u.created_at DESC`).all();

  const header = ['id', 'full_name', 'email', 'role', 'driver_verification_status', 'is_passenger', 'created_at'];
  const lines = [header.join(',')];
  for (const row of results) {
    const item = toItem(row);
    lines.push(
      [item.id, item.fullName, item.email, item.role, item.driverVerificationStatus, item.isPassenger ? 'yes' : 'no', item.createdAt]
        .map(csvEscape)
        .join(',')
    );
  }
  const csv = lines.join('\r\n') + '\r\n';
  const date = new Date().toISOString().slice(0, 10);

  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="genesis-users-${date}.csv"`,
  });
});
