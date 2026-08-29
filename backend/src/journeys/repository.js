import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function createJourney(ownerId, input) {
  const id = newId('journey');
  db.prepare(
    `INSERT INTO journeys (
      id, owner_id, type, origin_label, origin_lat, origin_lng,
      destination_label, destination_lat, destination_lng, departure_time,
      seats_total, seats_available, price_per_seat, currency, preferences_json, vehicle_type
    ) VALUES (@id, @owner_id, @type, @origin_label, @origin_lat, @origin_lng,
      @destination_label, @destination_lat, @destination_lng, @departure_time,
      @seats_total, @seats_available, @price_per_seat, @currency, @preferences_json, @vehicle_type)`
  ).run({
    id,
    owner_id: ownerId,
    type: input.type,
    origin_label: input.origin.label,
    origin_lat: input.origin.lat,
    origin_lng: input.origin.lng,
    destination_label: input.destination.label,
    destination_lat: input.destination.lat,
    destination_lng: input.destination.lng,
    departure_time: input.departureTime,
    seats_total: input.seats ?? 1,
    seats_available: input.seats ?? 1,
    price_per_seat: input.pricePerSeat ?? 0,
    currency: input.currency ?? 'USD',
    preferences_json: JSON.stringify(input.preferences ?? {}),
    vehicle_type: input.type === 'offer' ? input.vehicleType ?? null : null,
  });
  return getJourneyById(id);
}

export function getJourneyById(id) {
  return deserialize(db.prepare(`SELECT * FROM journeys WHERE id = ?`).get(id));
}

export function listJourneys({ type, status = 'active', ownerId } = {}) {
  const clauses = [];
  const params = {};
  if (type) {
    clauses.push('type = @type');
    params.type = type;
  }
  if (status) {
    clauses.push('status = @status');
    params.status = status;
  }
  if (ownerId) {
    clauses.push('owner_id = @ownerId');
    params.ownerId = ownerId;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM journeys ${where} ORDER BY departure_time ASC`)
    .all(params)
    .map(deserialize);
}

export function decrementSeats(journeyId, seats) {
  const journey = getJourneyById(journeyId);
  if (!journey) return null;
  const nextAvailable = journey.seatsAvailable - seats;
  const nextStatus = nextAvailable <= 0 ? 'full' : journey.status;
  db.prepare(
    `UPDATE journeys SET seats_available = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(Math.max(nextAvailable, 0), nextStatus, journeyId);
  return getJourneyById(journeyId);
}

export function restoreSeats(journeyId, seats) {
  const journey = getJourneyById(journeyId);
  if (!journey) return null;
  const nextAvailable = Math.min(journey.seatsTotal, journey.seatsAvailable + seats);
  const nextStatus = nextAvailable > 0 && journey.status === 'full' ? 'active' : journey.status;
  db.prepare(
    `UPDATE journeys SET seats_available = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(nextAvailable, nextStatus, journeyId);
  return getJourneyById(journeyId);
}

export function updateJourneyStatus(journeyId, status) {
  db.prepare(`UPDATE journeys SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, journeyId);
  return getJourneyById(journeyId);
}

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    origin: { label: row.origin_label, lat: row.origin_lat, lng: row.origin_lng },
    destination: { label: row.destination_label, lat: row.destination_lat, lng: row.destination_lng },
    departureTime: row.departure_time,
    seatsTotal: row.seats_total,
    seatsAvailable: row.seats_available,
    pricePerSeat: row.price_per_seat,
    currency: row.currency,
    preferences: JSON.parse(row.preferences_json),
    vehicleType: row.vehicle_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
