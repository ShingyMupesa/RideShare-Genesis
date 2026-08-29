import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';
import { assertTransition } from './stateMachine.js';

export function createBooking({ journeyId, passengerId, matchId, seats, totalPrice, currency, initialStatus }) {
  const id = newId('booking');
  db.prepare(
    `INSERT INTO bookings (id, journey_id, passenger_id, match_id, seats, total_price, currency, status, status_history_json)
     VALUES (@id, @journey_id, @passenger_id, @match_id, @seats, @total_price, @currency, @status, @status_history_json)`
  ).run({
    id,
    journey_id: journeyId,
    passenger_id: passengerId,
    match_id: matchId || null,
    seats,
    total_price: totalPrice,
    currency,
    status: initialStatus,
    status_history_json: JSON.stringify([{ status: initialStatus, at: new Date().toISOString() }]),
  });
  return getBookingById(id);
}

export function getBookingById(id) {
  return deserialize(db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id));
}

export function listBookingsForUser(userId) {
  return db
    .prepare(
      `SELECT b.* FROM bookings b
       LEFT JOIN journeys j ON j.id = b.journey_id
       WHERE b.passenger_id = ? OR j.owner_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(userId, userId)
    .map(deserialize);
}

export function listBookingsForJourney(journeyId) {
  return db.prepare(`SELECT * FROM bookings WHERE journey_id = ?`).all(journeyId).map(deserialize);
}

export function transitionBooking(id, nextStatus) {
  const booking = getBookingById(id);
  if (!booking) return null;
  assertTransition(booking.status, nextStatus);

  const history = [...booking.statusHistory, { status: nextStatus, at: new Date().toISOString() }];
  db.prepare(
    `UPDATE bookings SET status = ?, status_history_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(nextStatus, JSON.stringify(history), id);
  return getBookingById(id);
}

export function setBookingImpact(id, impact) {
  db.prepare(`UPDATE bookings SET impact_json = ? WHERE id = ?`).run(JSON.stringify(impact), id);
  return getBookingById(id);
}

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
