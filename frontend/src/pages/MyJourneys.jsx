import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

const STATUS_PILL = {
  active: 'pill-success',
  full: 'pill-warning',
  cancelled: 'pill-danger',
  completed: 'pill',
};

const BOOKING_PILL = {
  REQUESTED: 'pill',
  MATCHED: 'pill-primary',
  BOOKING_REQUESTED: 'pill-warning',
  CONFIRMED: 'pill-primary',
  IN_PROGRESS: 'pill-warning',
  COMPLETED: 'pill-success',
  CANCELLED: 'pill-danger',
};

export default function MyJourneys() {
  const [tab, setTab] = useState('bookings');
  const [journeys, setJourneys] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');

  const completedImpact = bookings
    .filter((b) => b.status === 'COMPLETED' && b.impact?.co2eKgAvoided)
    .reduce(
      (totals, b) => ({
        co2eKg: totals.co2eKg + b.impact.co2eKgAvoided,
        fuelL: totals.fuelL + (b.impact.fuelLitersAvoided || 0),
      }),
      { co2eKg: 0, fuelL: 0 }
    );

  useEffect(() => {
    Promise.all([api.listJourneys('?mine=true&status='), api.myBookings()])
      .then(([journeyRes, bookingRes]) => {
        setJourneys(journeyRes.journeys);
        setBookings(bookingRes.bookings);
      })
      .catch((err) => setError(err.message || 'Could not load your journeys'));
  }, []);

  return (
    <div>
      <p className="eyebrow">My Journeys</p>
      <h1>Everything you're part of</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {completedImpact.co2eKg > 0 && (
        <p className="muted" style={{ marginBottom: 12 }}>
          🌍 Across your completed trips, Genesis estimates you've avoided about{' '}
          <strong>{Math.round(completedImpact.co2eKg * 10) / 10} kg CO2e</strong> and{' '}
          <strong>{Math.round(completedImpact.fuelL * 10) / 10} L of fuel</strong> — an estimate, not a measurement.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'bookings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('bookings')}>
          Bookings ({bookings.length})
        </button>
        <button className={`btn btn-sm ${tab === 'journeys' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('journeys')}>
          Published journeys ({journeys.length})
        </button>
      </div>

      {tab === 'bookings' && (
        <div className="journey-list">
          {bookings.length === 0 && <p className="muted">No bookings yet — go find or offer a journey.</p>}
          {bookings.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="journey-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div>
                <p className="journey-route">Booking {b.id.slice(0, 12)}…</p>
                <p className="muted">
                  {b.seats} seat(s) · {b.currency} {b.totalPrice}
                </p>
              </div>
              <span className={`pill ${BOOKING_PILL[b.status] || 'pill'}`}>{b.status}</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'journeys' && (
        <div className="journey-list">
          {journeys.length === 0 && <p className="muted">You haven't offered or requested a journey yet.</p>}
          {journeys.map((j) => (
            <Link key={j.id} to={`/journeys/${j.id}`} className="journey-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div>
                <p className="journey-route">
                  {j.origin.label} → {j.destination.label}
                </p>
                <p className="muted">
                  {j.type === 'offer' ? 'Offered' : 'Requested'} · {new Date(j.departureTime).toLocaleString()}
                </p>
              </div>
              <span className={`pill ${STATUS_PILL[j.status] || 'pill'}`}>{j.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
