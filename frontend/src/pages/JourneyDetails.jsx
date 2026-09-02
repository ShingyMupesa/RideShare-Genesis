import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import VerifiedDriverBadge from '../components/VerifiedDriverBadge.jsx';

const PREFERENCE_LABELS = {
  chattiness: 'Chattiness',
  music: 'Music',
  smoking: 'Smoking',
  pets_ok: 'Pets',
  luggage: 'Luggage',
  gender_pref: 'Gender preference',
};

function formatPreferenceValue(key, value) {
  if (typeof value === 'boolean') {
    if (key === 'smoking') return value ? 'Allowed' : 'Not allowed';
    if (key === 'pets_ok') return value ? 'Welcome' : 'Not allowed';
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  }
  return String(value);
}

export default function JourneyDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [seats, setSeats] = useState(1);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api
      .getJourney(id)
      .then((res) => setJourney(res.journey))
      .catch((err) => setError(err.message || 'Could not load journey'));
  }, [id]);

  async function handleBook() {
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/journeys/${id}` } } });
      return;
    }
    setBooking(true);
    setError('');
    try {
      const { booking: newBooking } = await api.createBooking({ journeyId: id, seats: Number(seats) });
      navigate(`/bookings/${newBooking.id}`);
    } catch (err) {
      setError(err.message || 'Could not book this journey');
    } finally {
      setBooking(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setError('');
    try {
      const { journey: updated } = await api.cancelJourney(id);
      setJourney(updated);
    } catch (err) {
      setError(err.message || 'Could not cancel journey');
    } finally {
      setCancelling(false);
    }
  }

  if (error && !journey) return <div className="alert alert-error">{error}</div>;
  if (!journey) return <p className="muted">Loading journey…</p>;

  const isOwner = user?.id === journey.ownerId;
  const cancellable = ['active', 'full'].includes(journey.status);

  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <p className="eyebrow">{journey.type === 'offer' ? 'Offered journey' : 'Requested journey'}</p>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {journey.origin.label} → {journey.destination.label}
        {journey.type === 'offer' && journey.ownerDriverVerified && <VerifiedDriverBadge />}
      </h1>
      <p className="muted">{new Date(journey.departureTime).toLocaleString()}</p>
      {error && <div className="alert alert-error">{error}</div>}
      <p>
        <span className="pill">{journey.currency} {journey.pricePerSeat}/seat</span>{' '}
        <span className="pill">{journey.seatsAvailable}/{journey.seatsTotal} seats available</span>{' '}
        <span className={`pill ${journey.status === 'active' ? 'pill-success' : 'pill-warning'}`}>{journey.status}</span>
      </p>

      {journey.preferences && Object.keys(journey.preferences).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="eyebrow">Preferences</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(journey.preferences).map(([key, value]) => (
              <span key={key} className="pill">
                {PREFERENCE_LABELS[key] || key}: {formatPreferenceValue(key, value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {journey.type === 'offer' && !isOwner && journey.status === 'active' && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          <div className="form-field">
            <label htmlFor="seats">Seats to book</label>
            <input
              id="seats"
              type="number"
              min="1"
              max={journey.seatsAvailable}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleBook} disabled={booking}>
            {booking ? 'Booking…' : 'Book this ride'}
          </button>
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          <p className="muted">This is your journey.</p>
          {cancellable ? (
            <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel journey'}
            </button>
          ) : (
            journey.status === 'cancelled' && <span className="pill">Cancelled</span>
          )}
        </div>
      )}
    </div>
  );
}
