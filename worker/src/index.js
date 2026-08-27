import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyJwt } from './lib/jwt.js';
import { ApiError } from './lib/errors.js';

import { users } from './routes/users.js';
import { journeys } from './routes/journeys.js';
import { matching } from './routes/matching.js';
import { bookings } from './routes/bookings.js';
import { payments } from './routes/payments.js';
import { messaging, assertBookingAccess } from './routes/messaging.js';
import { safety } from './routes/safety.js';
import { governance } from './routes/governance.js';
import { ai } from './routes/ai.js';

export { BookingRoom } from './durable-objects/BookingRoom.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const corsMiddleware = cors({ origin: c.env.CLIENT_ORIGIN || '*' });
  return corsMiddleware(c, next);
});

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'rideshare-genesis-worker', time: new Date().toISOString() }));

app.route('/api/users', users);
app.route('/api/journeys', journeys);
app.route('/api/matching', matching);
app.route('/api/bookings', bookings);
app.route('/api/payments', payments);
app.route('/api/messages', messaging);
app.route('/api/safety', safety);
app.route('/api/governance', governance);
app.route('/api/ai', ai);

// Real-time messaging: browsers can't set custom headers on a WebSocket
// handshake, so the token travels as a query param here instead of an
// Authorization header. It's verified before the connection is ever
// forwarded to the booking's Durable Object.
app.get('/ws/booking/:id', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.text('Missing token', 401);
  if (!c.env.JWT_SECRET) return c.text('Server misconfigured: JWT_SECRET not set', 500);

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.text('Invalid or expired token', 401);
  }

  const bookingId = c.req.param('id');
  try {
    await assertBookingAccess(c.env.DB, bookingId, payload.sub);
  } catch (err) {
    return c.text(err.message || 'Forbidden', err.status || 403);
  }

  const stub = c.env.BOOKING_ROOMS.get(c.env.BOOKING_ROOMS.idFromName(bookingId));
  const url = new URL(c.req.url);
  url.searchParams.set('userId', payload.sub);
  url.searchParams.set('bookingId', bookingId);
  return stub.fetch(url.toString(), c.req.raw);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}` } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

export default app;
