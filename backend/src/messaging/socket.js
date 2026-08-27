import { createMessage } from './repository.js';
import * as Bookings from '../bookings/repository.js';
import * as Journeys from '../journeys/repository.js';

function canAccessBooking(bookingId, userId) {
  const booking = Bookings.getBookingById(bookingId);
  if (!booking) return false;
  const journey = Journeys.getJourneyById(booking.journeyId);
  return booking.passengerId === userId || journey.ownerId === userId;
}

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
  });
}
