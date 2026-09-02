import { Hono } from 'hono';
import { requireAuth, optionalAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { ApiError, BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { generateMatchesForJourney } from '../lib/matching.js';
import { VEHICLE_TYPES } from '../lib/impact.js';
import * as DriverVerification from '../lib/driverVerification.js';

export const journeys = new Hono();

const VERIFICATION_MESSAGES = {
  unverified: 'Complete driver verification before posting a journey. Add your details on your profile — an admin will review them shortly.',
  pending: 'Your driver verification is still under review. We will notify you as soon as an admin clears it.',
  rejected: 'Your driver verification was not approved. Check the reviewer note on your profile and resubmit.',
};

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    origin: { label: row.origin_label, lat: row.origin_lat, lng: row.origin_lng },
    destination: { label: row.destination_label, lat: row.destination_lat, lng: row.destination_lng },
    departureTime: row.departure_time,
    seatsTotal: row.seats_total,
    seatsAvailable: row.seats_available,
    pricePerSeat: row.price_per_seat,
    currency: row.currency,
    preferences: JSON.parse(row.preferences_json),
    vehicleType: row.vehicle_type,
    status: row.status,
    // Only meaningful for `offer` journeys — surfaced so the frontend can
    // render a "Verified Driver" badge on offer cards without a second
    // lookup per journey.
    ownerDriverVerified: row.owner_driver_verification_status === 'verified',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_JOURNEY = `SELECT j.*, p.driver_verification_status AS owner_driver_verification_status
  FROM journeys j LEFT JOIN profiles p ON p.user_id = j.owner_id`;

export async function getJourneyById(db, id) {
  await DriverVerification.ensureDriverVerificationSchema(db);
  const row = await db.prepare(`${SELECT_JOURNEY} WHERE j.id = ?`).bind(id).first();
  return deserialize(row);
}

export async function listJourneys(db, { type, status = 'active', ownerId } = {}) {
  await DriverVerification.ensureDriverVerificationSchema(db);
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
  if (ownerId) {
    clauses.push('j.owner_id = ?');
    params.push(ownerId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db
    .prepare(`${SELECT_JOURNEY} ${where} ORDER BY j.departure_time ASC`)
    .bind(...params)
    .all();
  return results.map(deserialize);
}

export async function decrementSeats(db, journeyId, seats) {
  const journey = await getJourneyById(db, journeyId);
  if (!journey) return null;
  const nextAvailable = Math.max(journey.seatsAvailable - seats, 0);
  const nextStatus = nextAvailable <= 0 ? 'full' : journey.status;
  await db
    .prepare('UPDATE journeys SET seats_available = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(nextAvailable, nextStatus, journeyId)
    .run();
  return getJourneyById(db, journeyId);
}

export async function restoreSeats(db, journeyId, seats) {
  const journey = await getJourneyById(db, journeyId);
  if (!journey) return null;
  const nextAvailable = Math.min(journey.seatsTotal, journey.seatsAvailable + seats);
  const nextStatus = nextAvailable > 0 && journey.status === 'full' ? 'active' : journey.status;
  await db
    .prepare('UPDATE journeys SET seats_available = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(nextAvailable, nextStatus, journeyId)
    .run();
  return getJourneyById(db, journeyId);
}

function validateJourneyInput(body) {
  const { type, origin, destination, departureTime, seats, pricePerSeat } = body || {};
  if (!['offer', 'request'].includes(type)) throw BadRequest('type must be "offer" or "request"');
  if (!origin?.label || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
    throw BadRequest('origin must include label, lat, lng');
  }
  if (!destination?.label || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
    throw BadRequest('destination must include label, lat, lng');
  }
  if (!departureTime || Number.isNaN(Date.parse(departureTime))) {
    throw BadRequest('departureTime must be a valid ISO date string');
  }
  if (seats !== undefined && (!Number.isInteger(seats) || seats < 1)) {
    throw BadRequest('seats must be a positive integer');
  }
  if (pricePerSeat !== undefined && (typeof pricePerSeat !== 'number' || pricePerSeat < 0)) {
    throw BadRequest('pricePerSeat must be a non-negative number');
  }
  // Currency is mandatory, not defaulted — every financial figure in the
  // app (journey price, booking total, payment amount) must carry an
  // explicit currency the user actually chose, never a silent USD fallback.
  if (!body?.currency || typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency)) {
    throw BadRequest('currency is required and must be a 3-letter currency code (e.g. KES, USD)');
  }
  if (body?.vehicleType !== undefined && body.vehicleType !== null && !VEHICLE_TYPES.includes(body.vehicleType)) {
    throw BadRequest(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`);
  }
}

journeys.post('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  validateJourneyInput(body);

  // Driver verification only ever gates `offer` journeys — a rider
  // requesting a ride isn't the one being verified. Enforcement is a
  // platform-wide toggle an admin controls (default off), so this is a
  // no-op until that's switched on.
  await DriverVerification.ensureDriverVerificationSchema(db);
  if (body.type === 'offer' && (await DriverVerification.isEnforced(db))) {
    const driverStatus = (await DriverVerification.getStatus(db, authUser.id))?.status || 'unverified';
    if (driverStatus !== 'verified') {
      throw new ApiError(403, 'DRIVER_VERIFICATION_REQUIRED', VERIFICATION_MESSAGES[driverStatus] || VERIFICATION_MESSAGES.unverified, {
        status: driverStatus,
      });
    }
  }

  const id = newId('journey');
  await db
    .prepare(
      `INSERT INTO journeys (
        id, owner_id, type, origin_label, origin_lat, origin_lng,
        destination_label, destination_lat, destination_lng, departure_time,
        seats_total, seats_available, price_per_seat, currency, preferences_json, vehicle_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      authUser.id,
      body.type,
      body.origin.label,
      body.origin.lat,
      body.origin.lng,
      body.destination.label,
      body.destination.lat,
      body.destination.lng,
      body.departureTime,
      body.seats ?? 1,
      body.seats ?? 1,
      body.pricePerSeat ?? 0,
      body.currency.toUpperCase(),
      JSON.stringify(body.preferences ?? {}),
      body.type === 'offer' ? body.vehicleType ?? null : null
    )
    .run();

  const journey = await getJourneyById(db, id);
  let matches = [];
  if (journey.type === 'request') {
    matches = await generateMatchesForJourney(db, journey);
  }

  return c.json({ journey, matches }, 201);
});

// A `request` journey carries a rider's private pickup/drop-off intent
// (exact coordinates). Browsing the general list (not `mine=true`) must
// never leak that — same rule GET /:id already enforces for a single
// journey — so anything that isn't the viewer's own request gets reduced
// to route labels and trip terms only: enough for a free driver to gauge
// demand, nothing that identifies the requester or their exact location.
function redactIfPrivateRequest(journey, viewerId) {
  if (journey.type !== 'request' || journey.ownerId === viewerId) return journey;
  const { ownerId, origin, destination, ...rest } = journey;
  return { ...rest, origin: { label: origin.label }, destination: { label: destination.label } };
}

journeys.get('/', optionalAuth, async (c) => {
  const authUser = c.get('user');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const mine = c.req.query('mine');

  if (mine === 'true' && !authUser) throw Forbidden('Sign in to view your own journeys');
  const ownerId = mine === 'true' ? authUser.id : undefined;

  const results = await listJourneys(c.env.DB, { type, status, ownerId });
  return c.json({ journeys: results.map((j) => redactIfPrivateRequest(j, authUser?.id)) });
});

journeys.get('/:id', optionalAuth, async (c) => {
  const authUser = c.get('user');
  const journey = await getJourneyById(c.env.DB, c.req.param('id'));
  if (!journey) throw NotFound('Journey not found');

  // `offer` journeys are intentionally public marketplace listings. A
  // `request` journey carries a rider's private pickup/drop-off intent, so
  // only its owner may view it.
  if (journey.type === 'request' && journey.ownerId !== authUser?.id) {
    throw Forbidden('This journey is private to its owner');
  }

  return c.json({ journey });
});

journeys.post('/:id/cancel', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const journey = await getJourneyById(db, c.req.param('id'));
  if (!journey) throw NotFound('Journey not found');
  if (journey.ownerId !== authUser.id) throw Forbidden('Only the journey owner can cancel it');

  await db.prepare('UPDATE journeys SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('cancelled', journey.id).run();
  return c.json({ journey: await getJourneyById(db, journey.id) });
});
