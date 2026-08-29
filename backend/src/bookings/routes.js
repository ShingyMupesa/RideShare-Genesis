import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound, Conflict } from '../utils/errors.js';
import * as Bookings from './repository.js';
import * as Journeys from '../journeys/repository.js';
import { getProfile } from '../users/repository.js';
import { getMatchById } from '../matching/engine.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import { estimateBookingImpact } from '../utils/impact.js';

export const router = Router();

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { journeyId, matchId, seats = 1 } = req.body || {};
    if (!journeyId) throw BadRequest('journeyId is required');
    if (!Number.isInteger(seats) || seats < 1) throw BadRequest('seats must be a positive integer');

    const journey = Journeys.getJourneyById(journeyId);
    if (!journey) throw NotFound('Journey not found');
    if (journey.type !== 'offer') throw BadRequest('Bookings can only be made against offered journeys');
    if (journey.ownerId === req.user.id) throw BadRequest('You cannot book your own journey');
    if (journey.seatsAvailable < seats) throw Conflict('Not enough seats available');

    let match = null;
    if (matchId) {
      match = getMatchById(matchId);
      if (!match) throw NotFound('Match not found');
      if (match.requestJourney.ownerId !== req.user.id) throw Forbidden('This match does not belong to you');
    }

    const booking = Bookings.createBooking({
      journeyId,
      passengerId: req.user.id,
      matchId: matchId || null,
      seats,
      totalPrice: Number((journey.pricePerSeat * seats).toFixed(2)),
      currency: journey.currency,
      initialStatus: match ? 'MATCHED' : 'REQUESTED',
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'booking.created',
      entityType: 'booking',
      entityId: booking.id,
      metadata: { journeyId, seats, status: booking.status },
    });

    res.status(201).json({ booking });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = Bookings.listBookingsForUser(req.user.id);
    res.json({ bookings });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = Bookings.getBookingById(req.params.id);
    if (!booking) throw NotFound('Booking not found');
    const journey = Journeys.getJourneyById(booking.journeyId);
    if (booking.passengerId !== req.user.id && journey.ownerId !== req.user.id) {
      throw Forbidden('You do not have access to this booking');
    }
    // Once a booking exists, both parties are past the point of matching and
    // into actually settling up — showing each other's preferred payment
    // method here lets them coordinate (e.g. know upfront a driver is
    // cash-only) instead of discovering it mid-trip.
    const driverProfile = getProfile(journey.ownerId);
    const passengerProfile = getProfile(booking.passengerId);
    res.json({
      booking,
      journey,
      driverPaymentMethod: driverProfile?.preferences?.payment_method || null,
      passengerPaymentMethod: passengerProfile?.preferences?.payment_method || null,
    });
  })
);

function transitionHandler(nextStatus, { requireOwner = false, requirePassenger = false, seatEffect = null } = {}) {
  return asyncHandler(async (req, res) => {
    const booking = Bookings.getBookingById(req.params.id);
    if (!booking) throw NotFound('Booking not found');
    const journey = Journeys.getJourneyById(booking.journeyId);

    if (requireOwner && journey.ownerId !== req.user.id) throw Forbidden('Only the journey owner can do this');
    if (requirePassenger && booking.passengerId !== req.user.id) throw Forbidden('Only the passenger can do this');
    if (!requireOwner && !requirePassenger && booking.passengerId !== req.user.id && journey.ownerId !== req.user.id) {
      throw Forbidden('You do not have access to this booking');
    }

    if (seatEffect === 'decrement' && journey.seatsAvailable < booking.seats) {
      throw Conflict('Not enough seats available to confirm this booking');
    }

    let updated;
    try {
      updated = Bookings.transitionBooking(req.params.id, nextStatus);
    } catch (err) {
      throw BadRequest(err.message);
    }

    if (seatEffect === 'decrement') Journeys.decrementSeats(journey.id, booking.seats);
    if (seatEffect === 'restore' && ['BOOKING_REQUESTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      Journeys.restoreSeats(journey.id, booking.seats);
    }

    if (nextStatus === 'COMPLETED') {
      const impact = estimateBookingImpact({
        origin: journey.origin,
        destination: journey.destination,
        seats: booking.seats,
        vehicleType: journey.vehicleType,
      });
      updated = Bookings.setBookingImpact(booking.id, impact);
    }

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'booking.status_changed',
      entityType: 'booking',
      entityId: booking.id,
      metadata: { from: booking.status, to: nextStatus },
    });

    res.json({ booking: updated });
  });
}

// Passenger confirms intent to proceed; seats are reserved at this point.
router.post('/:id/request', requireAuth, transitionHandler('BOOKING_REQUESTED', { requirePassenger: true, seatEffect: 'decrement' }));

// Journey owner (driver) confirms the booking.
router.post('/:id/confirm', requireAuth, transitionHandler('CONFIRMED', { requireOwner: true }));

// Trip begins.
router.post('/:id/start', requireAuth, transitionHandler('IN_PROGRESS', {}));

// Trip ends.
router.post('/:id/complete', requireAuth, transitionHandler('COMPLETED', {}));

// Cancellable by either party from any non-terminal state.
router.post('/:id/cancel', requireAuth, transitionHandler('CANCELLED', { seatEffect: 'restore' }));
