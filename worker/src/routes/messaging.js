import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { getBookingById } from './bookings.js';
import { getJourneyById } from './journeys.js';

export const messaging = new Hono();

export async function assertBookingAccess(db, bookingId, userId) {
  const booking = await getBookingById(db, bookingId);
  if (!booking) throw NotFound('Booking not found');
  const journey = await getJourneyById(db, booking.journeyId);
  if (booking.passengerId !== userId && journey.ownerId !== userId) {
    throw Forbidden('You do not have access to this conversation');
  }
  return booking;
}

export async function createMessage(db, { bookingId, senderId, body }) {
  const id = newId('message');
  await db.prepare('INSERT INTO messages (id, booking_id, sender_id, body) VALUES (?, ?, ?, ?)').bind(id, bookingId, senderId, body).run();
  return db.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
}

messaging.get('/booking/:bookingId', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  await assertBookingAccess(db, c.req.param('bookingId'), authUser.id);
  const { results } = await db.prepare('SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at ASC').bind(c.req.param('bookingId')).all();
  return c.json({ messages: results });
});

messaging.post('/booking/:bookingId', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (!body.body || !body.body.trim()) throw BadRequest('Message body is required');

  await assertBookingAccess(db, c.req.param('bookingId'), authUser.id);
  const message = await createMessage(db, { bookingId: c.req.param('bookingId'), senderId: authUser.id, body: body.body.trim() });

  // Fan out to any live WebSocket viewers of this booking's Durable Object room.
  const stub = c.env.BOOKING_ROOMS.get(c.env.BOOKING_ROOMS.idFromName(c.req.param('bookingId')));
  await stub.fetch('https://booking-room/broadcast', { method: 'POST', body: JSON.stringify({ type: 'message:new', message }) });

  return c.json({ message }, 201);
});
