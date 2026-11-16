import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import VerifiedDriverBadge from '../components/VerifiedDriverBadge.jsx';

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

function RingProgress({ pct }) {
  const r = 21;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;
  return (
    <div className="ring-progress">
      <svg viewBox="0 0 52 52">
        <circle className="ring-progress__track" cx="26" cy="26" r={r} />
        <circle
          className="ring-progress__value"
          cx="26"
          cy="26"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="ring-progress__label">{pct}%</span>
    </div>
  );
}

export default function MyJourneys() {
  const [tab, setTab] = useState('bookings');
  const [journeys, setJourneys] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [proStatus, setProStatus] = useState(null);
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

  const offeredJourneys = journeys.filter((j) => j.type === 'offer').length;
  const completedBookings = bookings.filter((b) => b.status === 'COMPLETED').length;
  const completionRatePct = bookings.length ? Math.round((completedBookings / bookings.length) * 100) : null;

  useEffect(() => {
    Promise.all([api.listJourneys('?mine=true&status='), api.myBookings()])
      .then(([journeyRes, bookingRes]) => {
        setJourneys(journeyRes.journeys);
        setBookings(bookingRes.bookings);
      })
      .catch((err) => setError(err.message || 'Could not load your journeys'));
    // Pro Driver status is optional context for the dashboard — a passenger
    // who never visited /pro still has a (null) subscription here, so a
    // failure here must not block the rest of the page.
    api.proMe().then((res) => setProStatus(res.subscription)).catch(() => {});
  }, []);

  return (
    <div>
      <p className="eyebrow">My Journeys</p>
      <h1>Everything you're part of</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="driver-dashboard">
        <div className="driver-dashboard__heading">
          <h2>Your snapshot</h2>
          <span>Based on your real activity</span>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card__icon">🚗</div>
            <div className="stat-card__value">{offeredJourneys}</div>
            <div className="stat-card__label">Journeys offered</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__icon">✅</div>
            <div className="stat-card__value">{completedBookings}</div>
            <div className="stat-card__label">Completed trips</div>
          </div>
          {completionRatePct != null && (
            <div className="stat-card stat-card--ring">
              <RingProgress pct={completionRatePct} />
              <div>
                <div className="stat-card__value" style={{ fontSize: '1.15rem' }}>
                  {completionRatePct}%
                </div>
                <div className="stat-card__label">Booking completion rate</div>
              </div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-card__icon">🌍</div>
            <div className="stat-card__value">{Math.round(completedImpact.co2eKg * 10) / 10 || 0}</div>
            <div className="stat-card__label">kg CO2e avoided</div>
          </div>
          {proStatus && (
            <div className="stat-card">
              <div className="stat-card__icon">⭐</div>
              <div className="stat-card__value" style={{ fontSize: '1.15rem' }}>
                {proStatus.commissionRatePct}%
              </div>
              <div className="stat-card__label">Commission rate · {proStatus.planName}</div>
            </div>
          )}
        </div>
      </div>

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
                <p className="journey-route" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {j.origin.label} → {j.destination.label}
                  {j.type === 'offer' && j.ownerDriverVerified && <VerifiedDriverBadge />}
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
