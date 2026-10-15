// Surge advisory heuristic — intentionally a simple first-cut demand signal,
// NOT a real pricing model. It only ever reads data and returns a
// suggestion; nothing in this file writes anywhere, and nothing here must
// ever be wired to journeys.price_per_seat. Genesis's product promise is a
// driver-set, known-upfront flat price per journey — this module exists to
// advise a driver before they choose that price, never to change it for
// them.
import { haversineKm } from './geo.js';
import { getSetting } from './platformSettings.js';

// How far (km) and how close in departure time (ms) a journey has to be to
// the proposed offer to count as "the same market" for this estimate.
const DEMAND_RADIUS_KM = 10;
const TIME_WINDOW_MS = 2 * 60 * 60 * 1000; // +/- 2 hours

// Past this demand:supply ratio we consider demand "meaningfully" higher
// than supply and start suggesting a higher price.
const SURGE_RATIO_THRESHOLD = 1.5;

// Used only if nothing has ever been stored in platform_settings for
// 'surge_cap_multiplier' — mirrors the exact fallback pattern already used
// for commission_rate_pct in routes/platformSettings.js.
const DEFAULT_SURGE_CAP = 1.5;

/**
 * Estimate ride-sharing demand near a proposed offer's origin and departure
 * time, and return an advisory (never applied automatically) suggested
 * price multiplier.
 *
 * Heuristic (deliberately simple, well short of a real pricing model):
 *  - "demand" = active `request` journeys (riders looking for a ride) within
 *    DEMAND_RADIUS_KM of the point and within +/- TIME_WINDOW_MS of the time.
 *  - "supply" = active `offer` journeys (drivers already offering) in that
 *    same radius/window.
 *  - demandRatio = demand / supply (supply floored at 1 to avoid dividing by
 *    zero — a handful of requests with literally no competing offers yields
 *    a high but finite ratio instead of Infinity).
 *  - Once demandRatio crosses SURGE_RATIO_THRESHOLD, scale the suggested
 *    multiplier up linearly with how far past the threshold it sits, capped
 *    at the admin-configured surge_cap_multiplier (default 1.5x). The
 *    multiplier is never below 1x (we only ever suggest pricing *up*, never
 *    down) and never above the cap.
 *
 * @param {object} db - D1 database binding
 * @param {{ lat: number, lng: number, departureTime: string }} params
 */
export async function estimateDemand(db, { lat, lng, departureTime }) {
  const target = new Date(departureTime).getTime();
  const windowStart = new Date(target - TIME_WINDOW_MS).toISOString();
  const windowEnd = new Date(target + TIME_WINDOW_MS).toISOString();

  // Pull active journeys departing in the time window, then geo-filter in
  // JS with the shared haversineKm helper — D1/SQLite has no built-in
  // great-circle distance function. Fine at current scale (active journeys
  // is a small table); a bounding-box SQL pre-filter would be the next step
  // if this ever needs to scale further.
  const { results } = await db
    .prepare(
      `SELECT type, origin_lat, origin_lng FROM journeys
       WHERE status = 'active' AND departure_time BETWEEN ? AND ?`
    )
    .bind(windowStart, windowEnd)
    .all();

  let demandCount = 0; // nearby `request` journeys = riders looking for a ride
  let supplyCount = 0; // nearby `offer` journeys = drivers already offering

  for (const row of results) {
    const distanceKm = haversineKm({ lat, lng }, { lat: row.origin_lat, lng: row.origin_lng });
    if (distanceKm > DEMAND_RADIUS_KM) continue;
    if (row.type === 'request') demandCount += 1;
    else if (row.type === 'offer') supplyCount += 1;
  }

  const demandRatio = demandCount / Math.max(supplyCount, 1);

  const capRaw = await getSetting(db, 'surge_cap_multiplier');
  const capParsed = capRaw != null ? Number(capRaw) : NaN;
  const effectiveCap = Number.isFinite(capParsed) && capParsed > 1 ? capParsed : DEFAULT_SURGE_CAP;

  const suggested = demandRatio > SURGE_RATIO_THRESHOLD;

  let suggestedMultiplier = 1;
  if (suggested) {
    // First-cut linear scaling — not a sophisticated pricing model, just
    // enough to make "a lot more demand" suggest a bigger bump than
    // "barely over the threshold", while always respecting the cap.
    const scaled = 1 + (demandRatio - SURGE_RATIO_THRESHOLD) * 0.25;
    suggestedMultiplier = Math.min(effectiveCap, Math.max(1, scaled));
  }

  const note = suggested
    ? `Demand is running ahead of supply near this area and time (${demandCount} rider request(s) vs ${supplyCount} driver offer(s) nearby). Consider pricing up to about ${suggestedMultiplier.toFixed(2)}x the usual rate. This is advisory only — it never changes a price you or a passenger have already agreed to.`
    : `Demand and supply look roughly balanced near this area and time (${demandCount} rider request(s) vs ${supplyCount} driver offer(s) nearby).`;

  return { demandRatio, suggested, suggestedMultiplier, note, demandCount, supplyCount };
}
