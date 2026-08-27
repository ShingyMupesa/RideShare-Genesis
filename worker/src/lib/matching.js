import { haversineKm } from './geo.js';
import { newId } from './ids.js';
import { listJourneys, getJourneyById } from '../routes/journeys.js';

const DEFAULT_WEIGHTS = { proximity: 0.35, timing: 0.3, price: 0.15, preferences: 0.15, reliability: 0.05 };
const MAX_DETOUR_KM = 8;
const MAX_TIME_WINDOW_MIN = 90;

export function scoreMatch(requestJourney, offerJourney, weights = DEFAULT_WEIGHTS) {
  const originGapKm = haversineKm(requestJourney.origin, offerJourney.origin);
  const destGapKm = haversineKm(requestJourney.destination, offerJourney.destination);
  const avgGapKm = (originGapKm + destGapKm) / 2;
  const proximityScore = clamp01(1 - avgGapKm / MAX_DETOUR_KM);

  const timeGapMin = Math.abs((Date.parse(requestJourney.departureTime) - Date.parse(offerJourney.departureTime)) / 60000);
  const timingScore = clamp01(1 - timeGapMin / MAX_TIME_WINDOW_MIN);

  const requestBudget = requestJourney.pricePerSeat || offerJourney.pricePerSeat || 1;
  const priceDiff = offerJourney.pricePerSeat - requestBudget;
  const priceScore = clamp01(1 - Math.max(0, priceDiff) / Math.max(requestBudget, 1));

  const preferenceScore = comparePreferences(requestJourney.preferences, offerJourney.preferences);
  const reliabilityScore = 0.8;

  const factors = {
    proximity: { score: round(proximityScore), weight: weights.proximity, detail: `${round(avgGapKm, 1)} km average origin/destination gap` },
    timing: { score: round(timingScore), weight: weights.timing, detail: `${Math.round(timeGapMin)} min apart on departure time` },
    price: { score: round(priceScore), weight: weights.price, detail: `Offer priced at ${offerJourney.currency} ${offerJourney.pricePerSeat} vs. your ${requestBudget}` },
    preferences: { score: round(preferenceScore), weight: weights.preferences, detail: describePreferenceMatch(requestJourney.preferences, offerJourney.preferences) },
    reliability: { score: round(reliabilityScore), weight: weights.reliability, detail: 'Based on driver trip-completion history' },
  };

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;
  const weightedSum = Object.values(factors).reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = clamp01(weightedSum / totalWeight);

  return { score: round(score), factors, narrative: buildNarrative(factors, score) };
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
  if (considered === 0) return 0.7;
  return matches / considered;
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
    `stated preferences, and driver reliability — you can see and adjust these ` +
    `weights in your Decision DNA settings.`
  );
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export async function generateMatchesForJourney(db, requestJourney, { limit = 5 } = {}) {
  const profileRow = await db.prepare('SELECT decision_dna_json FROM profiles WHERE user_id = ?').bind(requestJourney.ownerId).first();
  const weights = profileRow ? JSON.parse(profileRow.decision_dna_json).weights : DEFAULT_WEIGHTS;

  const candidates = (await listJourneys(db, { type: 'offer', status: 'active' })).filter(
    (offer) => offer.ownerId !== requestJourney.ownerId && offer.seatsAvailable > 0
  );

  const scored = candidates
    .map((offer) => ({ offer, result: scoreMatch(requestJourney, offer, weights) }))
    .filter(({ result }) => result.score > 0.15)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);

  const matches = [];
  for (const { offer, result } of scored) {
    const id = newId('match');
    await db
      .prepare(
        `INSERT INTO matches (id, request_journey_id, offer_journey_id, score, decision_dna_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, requestJourney.id, offer.id, result.score, JSON.stringify(result))
      .run();
    matches.push(await getMatchById(db, id));
  }
  return matches;
}

export async function getMatchById(db, id) {
  const row = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first();
  if (!row) return null;
  const offer = await getJourneyById(db, row.offer_journey_id);
  const request = await getJourneyById(db, row.request_journey_id);
  return {
    id: row.id,
    requestJourneyId: row.request_journey_id,
    offerJourneyId: row.offer_journey_id,
    score: row.score,
    status: row.status,
    decisionDna: JSON.parse(row.decision_dna_json),
    offerJourney: offer,
    requestJourney: request,
    createdAt: row.created_at,
  };
}

export async function updateMatchStatus(db, id, status) {
  await db.prepare('UPDATE matches SET status = ? WHERE id = ?').bind(status, id).run();
  return getMatchById(db, id);
}
