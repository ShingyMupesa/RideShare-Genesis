import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Journeys from './repository.js';
import { generateMatchesForJourney } from '../matching/engine.js';
import { VEHICLE_TYPES } from '../utils/impact.js';

export const router = Router();

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

// Find Journey / Offer Journey both post here; `type` distinguishes them.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    validateJourneyInput(req.body);
    const journey = Journeys.createJourney(req.user.id, req.body);

    let matches = [];
    if (journey.type === 'request') {
      matches = generateMatchesForJourney(journey);
    }

    res.status(201).json({ journey, matches });
  })
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { type, status, mine } = req.query;
    const ownerId = mine === 'true' ? req.user?.id : undefined;
    if (mine === 'true' && !req.user) throw Forbidden('Sign in to view your own journeys');
    const journeys = Journeys.listJourneys({ type, status, ownerId });
    res.json({ journeys });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const journey = Journeys.getJourneyById(req.params.id);
    if (!journey) throw NotFound('Journey not found');
    // `offer` journeys are intentionally public marketplace listings. A
    // `request` journey carries a rider's private pickup/drop-off intent,
    // so only its owner may view it — anyone else gets a 403 rather than
    // silently leaking coordinates to whoever learns the id.
    if (journey.type === 'request' && journey.ownerId !== req.user?.id) {
      throw Forbidden('This journey is private to its owner');
    }
    res.json({ journey });
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const journey = Journeys.getJourneyById(req.params.id);
    if (!journey) throw NotFound('Journey not found');
    if (journey.ownerId !== req.user.id) throw Forbidden('Only the journey owner can cancel it');
    const updated = Journeys.updateJourneyStatus(req.params.id, 'cancelled');
    res.json({ journey: updated });
  })
);
