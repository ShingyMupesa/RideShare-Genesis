import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

export default function JourneyDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [seats, setSeats] = useState(1);

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

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!journey) return <p className="muted">Loading journey…</p>;

  const isOwner = user?.id === journey.ownerId;

  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <p className="eyebrow">{journey.type === 'offer' ? 'Offered journey' : 'Requested journey'}</p>
      <h1>
        {journey.origin.label} → {journey.destination.label}
      </h1>
      <p className="muted">{new Date(journey.departureTime).toLocaleString()}</p>
      <p>
        <span className="pill">{journey.currency} {journey.pricePerSeat}/seat</span>{' '}
        <span className="pill">{journey.seatsAvailable}/{journey.seatsTotal} seats available</span>{' '}
        <span className={`pill ${journey.status === 'active' ? 'pill-success' : 'pill-warning'}`}>{journey.status}</span>
      </p>

      {journey.preferences && Object.keys(journey.preferences).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="eyebrow">Preferences</p>
          <p className="muted">{JSON.stringify(journey.preferences)}</p>
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

      {isOwner && <p className="muted" style={{ marginTop: 16 }}>This is your journey.</p>}
    </div>
  );
}
