import { createMessage } from './repository.js';
import * as Bookings from '../bookings/repository.js';
import * as Journeys from '../journeys/repository.js';
import { upsertLiveLocation } from '../liveLocations/repository.js';

function canAccessBooking(bookingId, userId) {
  const booking = Bookings.getBookingById(bookingId);
  if (!booking) return false;
  const journey = Journeys.getJourneyById(booking.journeyId);
  return booking.passengerId === userId || journey.ownerId === userId;
}

// Throttles live_locations writes to at most once every 15s per booking,
// same as the Durable Object's BookingRoom.lastPersistedAt. The DO keeps
// that state per-instance because each one is already scoped to a single
// booking (idFromName(bookingId)); this Socket.IO server is one long-lived
// process handling every booking at once, so the equivalent state has to
// be keyed by bookingId here instead of living on a per-connection object.
const lastPersistedAtByBooking = new Map();
const PERSIST_THROTTLE_MS = 15000;

export function attachSocket(io) {
  io.on('connection', (socket) => {
    socket.on('booking:join', (bookingId) => {
      if (canAccessBooking(bookingId, socket.user.id)) {
        socket.join(`booking:${bookingId}`);
      }
    });

    socket.on('message:send', ({ bookingId, body }) => {
      if (!body || !body.trim() || !canAccessBooking(bookingId, socket.user.id)) return;
      const message = createMessage({ bookingId, senderId: socket.user.id, body: body.trim() });
      io.to(`booking:${bookingId}`).emit('message:new', message);
    });

    // No role-gating here — a passenger pinging their own location is
    // harmless and only ever broadcast within their own booking's room,
    // same as message:send above.
    socket.on('location:ping', ({ bookingId, lat, lng, heading }) => {
      if (typeof lat !== 'number' || typeof lng !== 'number' || !canAccessBooking(bookingId, socket.user.id)) return;

      io.to(`booking:${bookingId}`).emit('location:update', { lat, lng, heading: heading ?? null, at: new Date().toISOString() });

      const now = Date.now();
      const lastPersistedAt = lastPersistedAtByBooking.get(bookingId) || 0;
      if (now - lastPersistedAt >= PERSIST_THROTTLE_MS) {
        lastPersistedAtByBooking.set(bookingId, now);
        upsertLiveLocation({ bookingId, lat, lng, heading });
      }
    });
  });
}
