import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden, NotFound } from '../utils/errors.js';
import { getMatchById, updateMatchStatus, generateMatchesForJourney } from './engine.js';
import { getJourneyById } from '../journeys/repository.js';

export const router = Router();

// Re-run matching for an existing request journey (e.g. after editing Decision DNA weights).
router.post(
  '/journeys/:journeyId/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const journey = getJourneyById(req.params.journeyId);
    if (!journey) throw NotFound('Journey not found');
    if (journey.ownerId !== req.user.id) throw Forbidden('Only the journey owner can refresh matches');
    const matches = generateMatchesForJourney(journey);
    res.json({ matches });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const match = getMatchById(req.params.id);
    if (!match) throw NotFound('Match not found');
    res.json({ match });
  })
);

// The full, human-readable Decision DNA explanation for a match.
router.get(
  '/:id/explanation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const match = getMatchById(req.params.id);
    if (!match) throw NotFound('Match not found');
    res.json({
      matchId: match.id,
      score: match.score,
      narrative: match.decisionDna.narrative,
      factors: match.decisionDna.factors,
    });
  })
);

router.post(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const match = getMatchById(req.params.id);
    if (!match) throw NotFound('Match not found');
    if (match.requestJourney.ownerId !== req.user.id) throw Forbidden('Only the requester can accept a match');
    const updated = updateMatchStatus(req.params.id, 'accepted');
    res.json({ match: updated });
  })
);

router.post(
  '/:id/dismiss',
  requireAuth,
  asyncHandler(async (req, res) => {
    const match = getMatchById(req.params.id);
    if (!match) throw NotFound('Match not found');
    if (match.requestJourney.ownerId !== req.user.id) throw Forbidden('Only the requester can dismiss a match');
    const updated = updateMatchStatus(req.params.id, 'dismissed');
    res.json({ match: updated });
  })
);
