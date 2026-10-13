import { haversineKm } from './geo.js';

export const VEHICLE_TYPES = ['electric', 'hybrid', 'petrol', 'diesel', 'other'];

// Illustrative per-km factors, not measured data — used only until Genesis
// has enough real trip data to calibrate its own figures. The petrol/diesel
// baseline (~0.171 kgCO2e/km) reflects the commonly cited UK Government GHG
// Conversion Factors "average car" figure; electric/hybrid are rough
// relative adjustments for an average-grid-mix EV and a petrol-hybrid.
const CO2E_KG_PER_KM = { electric: 0.053, hybrid: 0.121, petrol: 0.171, diesel: 0.171, other: 0.171 };
const FUEL_L_PER_KM = { electric: 0, hybrid: 0.045, petrol: 0.075, diesel: 0.065, other: 0.075 };

// Straight-line origin-to-destination distance understates real road
// distance; this is a rough correction, not a routed estimate.
const ROUTING_FACTOR = 1.3;

export const IMPACT_METHODOLOGY =
  'Estimate only: straight-line origin-to-destination distance x 1.3 routing factor x seats booked, ' +
  'multiplied by published average per-km emission/fuel factors by vehicle type. Represents avoided ' +
  'duplicate solo trips for this booking, not a measured outcome.';

/**
 * Estimates the environmental impact "avoided" by a completed shared
 * booking, treating each booked seat as one solo trip that didn't happen.
 * Always an estimate — Genesis states its environmental ambition and works
 * to measure it, rather than asserting an unverified reduction figure.
 */
export function estimateBookingImpact({ origin, destination, seats, vehicleType }) {
  const straightLineKm = haversineKm(origin, destination);
  const roadKm = straightLineKm * ROUTING_FACTOR;
  const type = VEHICLE_TYPES.includes(vehicleType) ? vehicleType : 'other';
  const vehicleKmAvoided = roadKm * Math.max(seats, 1);

  return {
    distanceKm: round(roadKm, 1),
    seats,
    vehicleType: type,
    vehicleKmAvoided: round(vehicleKmAvoided, 1),
    co2eKgAvoided: round(vehicleKmAvoided * CO2E_KG_PER_KM[type], 2),
    fuelLitersAvoided: round(vehicleKmAvoided * FUEL_L_PER_KM[type], 2),
    methodology: IMPACT_METHODOLOGY,
  };
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
