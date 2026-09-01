import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Messages from './repository.js';
import * as Bookings from '../bookings/repository.js';
import * as Journeys from '../journeys/repository.js';
import { notifyUser } from '../push/notify.js';

export const router = Router();

async function assertBookingAccess(bookingId, userId) {
  const booking = Bookings.getBookingById(bookingId);
  if (!booking) throw NotFound('Booking not found');
  const journey = Journeys.getJourneyById(booking.journeyId);
  if (booking.passengerId !== userId && journey.ownerId !== userId) {
    throw Forbidden('You do not have access to this conversation');
  }
  return { booking, journey };
}

router.get(
  '/booking/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertBookingAccess(req.params.bookingId, req.user.id);
    const messages = Messages.listMessagesForBooking(req.params.bookingId);
    res.json({ messages });
  })
);

router.post(
  '/booking/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { body } = req.body || {};
    if (!body || !body.trim()) throw BadRequest('Message body is required');
    const { booking, journey } = await assertBookingAccess(req.params.bookingId, req.user.id);
    const message = Messages.createMessage({ bookingId: req.params.bookingId, senderId: req.user.id, body: body.trim() });
    req.app.get('io')?.to(`booking:${req.params.bookingId}`).emit('message:new', message);
    const recipientId = req.user.id === booking.passengerId ? journey.ownerId : booking.passengerId;
    await notifyUser(recipientId);
    res.status(201).json({ message });
  })
);
