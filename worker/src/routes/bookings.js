import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound, Conflict } from '../lib/errors.js';
import { assertTransition } from '../lib/stateMachine.js';
import { getMatchById } from '../lib/matching.js';
import { getJourneyById, decrementSeats, restoreSeats } from './journeys.js';
import { recordAuditEvent } from '../lib/audit.js';
import { estimateBookingImpact } from '../lib/impact.js';
import { getProfile } from './users.js';

export const bookings = new Hono();

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    journeyId: row.journey_id,
    passengerId: row.passenger_id,
    matchId: row.match_id,
    seats: row.seats,
    totalPrice: row.total_price,
    currency: row.currency,
    status: row.status,
    statusHistory: JSON.parse(row.status_history_json),
    impact: JSON.parse(row.impact_json || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getBookingById(db, id) {
  return deserialize(await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first());
}

async function transitionBooking(db, id, nextStatus) {
  const booking = await getBookingById(db, id);
  if (!booking) return null;
  assertTransition(booking.status, nextStatus);

  const history = [...booking.statusHistory, { status: nextStatus, at: new Date().toISOString() }];
  await db
    .prepare('UPDATE bookings SET status = ?, status_history_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(nextStatus, JSON.stringify(history), id)
    .run();
  return getBookingById(db, id);
}

bookings.post('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { journeyId, matchId, seats = 1 } = body;
  if (!journeyId) throw BadRequest('journeyId is required');
  if (!Number.isInteger(seats) || seats < 1) throw BadRequest('seats must be a positive integer');

  const journey = await getJourneyById(db, journeyId);
  if (!journey) throw NotFound('Journey not found');
  if (journey.type !== 'offer') throw BadRequest('Bookings can only be made against offered journeys');
  if (journey.ownerId === authUser.id) throw BadRequest('You cannot book your own journey');
  if (journey.seatsAvailable < seats) throw Conflict('Not enough seats available');

  let match = null;
  if (matchId) {
    match = await getMatchById(db, matchId);
    if (!match) throw NotFound('Match not found');
    if (match.requestJourney.ownerId !== authUser.id) throw Forbidden('This match does not belong to you');
  }

  const id = newId('booking');
  const totalPrice = Number((journey.pricePerSeat * seats).toFixed(2));
  const initialStatus = match ? 'MATCHED' : 'REQUESTED';
  await db
    .prepare(
      `INSERT INTO bookings (id, journey_id, passenger_id, match_id, seats, total_price, currency, status, status_history_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, journeyId, authUser.id, matchId || null, seats, totalPrice, journey.currency, initialStatus, JSON.stringify([{ status: initialStatus, at: new Date().toISOString() }]))
    .run();

  const booking = await getBookingById(db, id);

  await recordAuditEvent(db, {
    actorId: authUser.id,
    eventType: 'booking.created',
    entityType: 'booking',
    entityId: booking.id,
    metadata: { journeyId, seats, status: booking.status },
  });

  return c.json({ booking }, 201);
});

bookings.get('/mine', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const { results } = await db
    .prepare(
      `SELECT b.* FROM bookings b
       LEFT JOIN journeys j ON j.id = b.journey_id
       WHERE b.passenger_id = ? OR j.owner_id = ?
       ORDER BY b.created_at DESC`
    )
    .bind(authUser.id, authUser.id)
    .all();
  return c.json({ bookings: results.map(deserialize) });
});

bookings.get('/:id', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const booking = await getBookingById(db, c.req.param('id'));
  if (!booking) throw NotFound('Booking not found');
  const journey = await getJourneyById(db, booking.journeyId);
  if (booking.passengerId !== authUser.id && journey.ownerId !== authUser.id) {
    throw Forbidden('You do not have access to this booking');
  }
  // Once a booking exists, both parties are past the point of matching and
  // into actually settling up — showing each other's preferred payment
  // method here lets them coordinate (e.g. know upfront a driver is
  // cash-only) instead of discovering it mid-trip.
  const driverProfile = await getProfile(db, journey.ownerId);
  const passengerProfile = await getProfile(db, booking.passengerId);
  return c.json({
    booking,
    journey,
    driverPaymentMethod: driverProfile?.preferences?.payment_method || null,
    passengerPaymentMethod: passengerProfile?.preferences?.payment_method || null,
  });
});

function transitionRoute(nextStatus, { requireOwner = false, requirePassenger = false, seatEffect = null } = {}) {
  return async (c) => {
    const db = c.env.DB;
    const authUser = c.get('user');
    const booking = await getBookingById(db, c.req.param('id'));
    if (!booking) throw NotFound('Booking not found');
    const journey = await getJourneyById(db, booking.journeyId);

    if (requireOwner && journey.ownerId !== authUser.id) throw Forbidden('Only the journey owner can do this');
    if (requirePassenger && booking.passengerId !== authUser.id) throw Forbidden('Only the passenger can do this');
    if (!requireOwner && !requirePassenger && booking.passengerId !== authUser.id && journey.ownerId !== authUser.id) {
      throw Forbidden('You do not have access to this booking');
    }

    if (seatEffect === 'decrement' && journey.seatsAvailable < booking.seats) {
      throw Conflict('Not enough seats available to confirm this booking');
    }

    let updated;
    try {
      updated = await transitionBooking(db, c.req.param('id'), nextStatus);
    } catch (err) {
      throw BadRequest(err.message);
    }

    if (seatEffect === 'decrement') await decrementSeats(db, journey.id, booking.seats);
    if (seatEffect === 'restore' && ['BOOKING_REQUESTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      await restoreSeats(db, journey.id, booking.seats);
    }

    if (nextStatus === 'COMPLETED') {
      const impact = estimateBookingImpact({
        origin: journey.origin,
        destination: journey.destination,
        seats: booking.seats,
        vehicleType: journey.vehicleType,
      });
      await db.prepare('UPDATE bookings SET impact_json = ? WHERE id = ?').bind(JSON.stringify(impact), booking.id).run();
      updated = await getBookingById(db, booking.id);
    }

    await recordAuditEvent(db, {
      actorId: authUser.id,
      eventType: 'booking.status_changed',
      entityType: 'booking',
      entityId: booking.id,
      metadata: { from: booking.status, to: nextStatus },
    });

    return c.json({ booking: updated });
  };
}

bookings.post('/:id/request', requireAuth, transitionRoute('BOOKING_REQUESTED', { requirePassenger: true, seatEffect: 'decrement' }));
bookings.post('/:id/confirm', requireAuth, transitionRoute('CONFIRMED', { requireOwner: true }));
bookings.post('/:id/start', requireAuth, transitionRoute('IN_PROGRESS', {}));
bookings.post('/:id/complete', requireAuth, transitionRoute('COMPLETED', {}));
bookings.post('/:id/cancel', requireAuth, transitionRoute('CANCELLED', { seatEffect: 'restore' }));

export { getBookingById };
