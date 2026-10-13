import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { Forbidden, NotFound } from '../lib/errors.js';
import { getMatchById, updateMatchStatus, generateMatchesForJourney } from '../lib/matching.js';
import { getJourneyById } from './journeys.js';

export const matching = new Hono();

function assertMatchParty(match, userId) {
  if (match.requestJourney.ownerId !== userId && match.offerJourney.ownerId !== userId) {
    throw Forbidden('You are not a party to this match');
  }
}

matching.post('/journeys/:journeyId/refresh', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const journey = await getJourneyById(db, c.req.param('journeyId'));
  if (!journey) throw NotFound('Journey not found');
  if (journey.ownerId !== authUser.id) throw Forbidden('Only the journey owner can refresh matches');
  const matches = await generateMatchesForJourney(db, journey);
  return c.json({ matches });
});

matching.get('/:id', requireAuth, async (c) => {
  const authUser = c.get('user');
  const match = await getMatchById(c.env.DB, c.req.param('id'));
  if (!match) throw NotFound('Match not found');
  assertMatchParty(match, authUser.id);
  return c.json({ match });
});

matching.get('/:id/explanation', requireAuth, async (c) => {
  const authUser = c.get('user');
  const match = await getMatchById(c.env.DB, c.req.param('id'));
  if (!match) throw NotFound('Match not found');
  assertMatchParty(match, authUser.id);
  return c.json({
    matchId: match.id,
    score: match.score,
    narrative: match.decisionDna.narrative,
    factors: match.decisionDna.factors,
  });
});

matching.post('/:id/accept', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const match = await getMatchById(db, c.req.param('id'));
  if (!match) throw NotFound('Match not found');
  if (match.requestJourney.ownerId !== authUser.id) throw Forbidden('Only the requester can accept a match');
  const updated = await updateMatchStatus(db, c.req.param('id'), 'accepted');
  return c.json({ match: updated });
});

matching.post('/:id/dismiss', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const match = await getMatchById(db, c.req.param('id'));
  if (!match) throw NotFound('Match not found');
  if (match.requestJourney.ownerId !== authUser.id) throw Forbidden('Only the requester can dismiss a match');
  const updated = await updateMatchStatus(db, c.req.param('id'), 'dismissed');
  return c.json({ match: updated });
});
