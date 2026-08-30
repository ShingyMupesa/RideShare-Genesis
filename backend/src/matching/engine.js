import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';
import { haversineKm } from '../utils/geo.js';
import { listJourneys, getJourneyById } from '../journeys/repository.js';
import { getProfile } from '../users/repository.js';

const DEFAULT_WEIGHTS = {
  proximity: 0.32,
  timing: 0.28,
  price: 0.13,
  preferences: 0.13,
  reliability: 0.06,
  environmental: 0.08,
};

const CLEAN_VEHICLE_BONUS = { electric: 1, hybrid: 0.7, petrol: 0.4, diesel: 0.4, other: 0.4 };
const VEHICLE_TYPE_LABELS = { electric: 'an electric', hybrid: 'a hybrid', petrol: 'a petrol', diesel: 'a diesel', other: 'an unspecified-fuel' };

const MAX_DETOUR_KM = 8; // beyond this, proximity score collapses to 0
const MAX_TIME_WINDOW_MIN = 90; // beyond this, timing score collapses to 0

/**
 * Scores how well an `offer` journey serves a `request` journey, and returns
 * a fully transparent breakdown — Genesis's "Decision DNA" for the match.
 * Every number in `factors` is derived from data both parties can see; there
 * is no hidden weighting the rider cannot inspect.
 */
export function scoreMatch(requestJourney, offerJourney, weights = DEFAULT_WEIGHTS) {
  const originGapKm = haversineKm(requestJourney.origin, offerJourney.origin);
  const destGapKm = haversineKm(requestJourney.destination, offerJourney.destination);
  const avgGapKm = (originGapKm + destGapKm) / 2;
  const proximityScore = clamp01(1 - avgGapKm / MAX_DETOUR_KM);

  const timeGapMin = Math.abs(
    (Date.parse(requestJourney.departureTime) - Date.parse(offerJourney.departureTime)) / 60000
  );
  const timingScore = clamp01(1 - timeGapMin / MAX_TIME_WINDOW_MIN);

  const requestBudget = requestJourney.pricePerSeat || offerJourney.pricePerSeat || 1;
  const priceDiff = offerJourney.pricePerSeat - requestBudget;
  const priceScore = clamp01(1 - Math.max(0, priceDiff) / Math.max(requestBudget, 1));

  const preferenceScore = comparePreferences(requestJourney.preferences, offerJourney.preferences);

  const reliability = getDriverReliability(offerJourney.ownerId);

  const environmental = scoreEnvironmentalImpact(requestJourney, offerJourney);

  const factors = {
    proximity: { score: round(proximityScore), weight: weights.proximity, detail: `${round(avgGapKm, 1)} km average origin/destination gap` },
    timing: { score: round(timingScore), weight: weights.timing, detail: `${Math.round(timeGapMin)} min apart on departure time` },
    price: { score: round(priceScore), weight: weights.price, detail: `Offer priced at ${offerJourney.currency} ${offerJourney.pricePerSeat} vs. your ${requestBudget}` },
    preferences: { score: round(preferenceScore), weight: weights.preferences, detail: describePreferenceMatch(requestJourney.preferences, offerJourney.preferences) },
    reliability: { score: round(reliability.score), weight: weights.reliability, detail: reliability.detail },
    environmental: { score: round(environmental.score), weight: weights.environmental ?? 0.08, detail: environmental.detail },
  };

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;
  const weightedSum = Object.values(factors).reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = clamp01(weightedSum / totalWeight);

  return {
    score: round(score),
    factors,
    narrative: buildNarrative(factors, score),
  };
}

// A real, queried signal rather than an asserted one — Decision DNA never
// shows a number it can't back up. New drivers start at a neutral baseline
// (not penalized for having no history yet); each completed trip nudges the
// score up, capping once a driver has a solid track record on the platform.
function getDriverReliability(ownerId) {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM bookings b JOIN journeys j ON b.journey_id = j.id WHERE j.owner_id = ? AND b.status = 'COMPLETED'`)
    .get(ownerId);
  const completedTrips = row?.n || 0;
  const score = clamp01(0.6 + completedTrips * 0.05);
  const detail = completedTrips > 0
    ? `${completedTrips} completed trip${completedTrips === 1 ? '' : 's'} on Genesis`
    : 'No completed trips on Genesis yet — starts at a neutral baseline';
  return { score, detail };
}

function comparePreferences(a = {}, b = {}) {
  const keys = ['chattiness', 'music', 'smoking', 'pets_ok', 'luggage'];
  let matches = 0;
  let considered = 0;
  for (const key of keys) {
    if (a[key] === undefined || b[key] === undefined) continue;
    considered += 1;
    if (a[key] === b[key] || a[key] === 'flexible' || b[key] === 'flexible') matches += 1;
  }
  if (considered === 0) return 0.7; // neutral when preferences aren't set
  return matches / considered;
}

// A rough, explainable proxy for environmental fit: how much of this
// vehicle's spare capacity the match would use (a fuller car means fewer
// duplicate trips elsewhere) plus a bonus for lower-emission vehicle types.
// This informs ranking only — see src/utils/impact.js for the actual
// (also estimated) CO2e/fuel figures shown once a booking completes.
function scoreEnvironmentalImpact(requestJourney, offerJourney) {
  const requested = requestJourney.seatsTotal || 1;
  const filledAfterMatch = Math.max(0, offerJourney.seatsTotal - offerJourney.seatsAvailable) + requested;
  const utilization = clamp01(filledAfterMatch / Math.max(offerJourney.seatsTotal, 1));

  const vehicleType = offerJourney.vehicleType && CLEAN_VEHICLE_BONUS[offerJourney.vehicleType] !== undefined
    ? offerJourney.vehicleType
    : 'other';
  const cleanBonus = CLEAN_VEHICLE_BONUS[vehicleType];

  const score = clamp01(0.6 * utilization + 0.4 * cleanBonus);
  const detail = `Would fill ${Math.round(utilization * 100)}% of ${VEHICLE_TYPE_LABELS[vehicleType]} vehicle's seats`;
  return { score, detail };
}

function describePreferenceMatch(a = {}, b = {}) {
  const notes = [];
  if (a.chattiness && b.chattiness) {
    notes.push(
      a.chattiness === b.chattiness || a.chattiness === 'flexible' || b.chattiness === 'flexible'
        ? 'chattiness aligns'
        : `chattiness differs (${a.chattiness} vs ${b.chattiness})`
    );
  }
  if (a.smoking !== undefined && b.smoking !== undefined) {
    notes.push(a.smoking === b.smoking ? 'smoking preference matches' : 'smoking preference differs');
  }
  return notes.length ? notes.join('; ') : 'no strong preference signals set';
}

function buildNarrative(factors, score) {
  const ranked = Object.entries(factors).sort((a, b) => b[1].score * b[1].weight - a[1].score * a[1].weight);
  const [topKey, top] = ranked[0];
  const [weakKey, weak] = ranked[ranked.length - 1];
  const pct = Math.round(score * 100);
  return (
    `Genesis rated this match ${pct}/100. The strongest factor was ${topKey} ` +
    `(${top.detail}); the weakest was ${weakKey} (${weak.detail}). ` +
    `This score is a transparent weighted blend of proximity, timing, price fit, ` +
    `stated preferences, driver reliability, and estimated environmental impact — ` +
    `you can see and adjust these weights in your Decision DNA settings.`
  );
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Prepared lazily inside generateMatchesForJourney (not at module load time)
// because this module is imported before migrations run.

/**
 * Finds candidate offers for a request journey, scores each with the
 * requester's personal Decision DNA weights, persists the top results as
 * `matches`, and returns them ranked best-first.
 */
export function generateMatchesForJourney(requestJourney, { limit = 5 } = {}) {
  const profile = getProfile(requestJourney.ownerId);
  const weights = profile?.decision_dna?.weights || DEFAULT_WEIGHTS;

  const candidates = listJourneys({ type: 'offer', status: 'active' }).filter(
    (offer) => offer.ownerId !== requestJourney.ownerId && offer.seatsAvailable > 0
  );

  const scored = candidates
    .map((offer) => ({ offer, result: scoreMatch(requestJourney, offer, weights) }))
    .filter(({ result }) => result.score > 0.15)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, request_journey_id, offer_journey_id, score, decision_dna_json)
    VALUES (@id, @request_journey_id, @offer_journey_id, @score, @decision_dna_json)
  `);

  return scored.map(({ offer, result }) => {
    const id = newId('match');
    insertMatch.run({
      id,
      request_journey_id: requestJourney.id,
      offer_journey_id: offer.id,
      score: result.score,
      decision_dna_json: JSON.stringify(result),
    });
    return deserializeMatch(getMatchRow(id), offer, requestJourney);
  });
}

export function getMatchRow(id) {
  return db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
}

export function getMatchById(id) {
  const row = getMatchRow(id);
  if (!row) return null;
  const offer = getJourneyById(row.offer_journey_id);
  const request = getJourneyById(row.request_journey_id);
  return deserializeMatch(row, offer, request);
}

export function updateMatchStatus(id, status) {
  db.prepare(`UPDATE matches SET status = ? WHERE id = ?`).run(status, id);
  return getMatchById(id);
}

function deserializeMatch(row, offerJourney, requestJourney) {
  return {
    id: row.id,
    requestJourneyId: row.request_journey_id,
    offerJourneyId: row.offer_journey_id,
    score: row.score,
    status: row.status,
    decisionDna: JSON.parse(row.decision_dna_json),
    offerJourney,
    requestJourney,
    createdAt: row.created_at,
  };
}
