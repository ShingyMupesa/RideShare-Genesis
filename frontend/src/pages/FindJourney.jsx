import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { CURRENCIES, DEFAULT_CURRENCY } from '../constants/currencies.js';
import LocationField from '../components/LocationField.jsx';

export default function FindJourney() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillQuery = searchParams.get('q') || '';
  const [origin, setOrigin] = useState({ label: prefillQuery, lat: '', lng: '' });
  const [destination, setDestination] = useState({ label: '', lat: '', lng: '' });
  const [departureTime, setDepartureTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [pricePerSeat, setPricePerSeat] = useState(10);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/find' } } });
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { journey, matches } = await api.createJourney({
        type: 'request',
        origin: { ...origin, lat: Number(origin.lat), lng: Number(origin.lng) },
        destination: { ...destination, lat: Number(destination.lat), lng: Number(destination.lng) },
        departureTime: new Date(departureTime).toISOString(),
        seats: Number(seats),
        pricePerSeat: Number(pricePerSeat),
        currency,
      });
      navigate(`/matches/${journey.id}`, { state: { matches, journey } });
    } catch (err) {
      setError(err.message || 'Could not search for journeys');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Find a Journey</p>
      <h1>Where are you headed?</h1>
      <p className="muted">
        Tell Genesis your route and budget — we'll match you against active offers and show exactly why.
      </p>
      {prefillQuery && (
        <p className="muted">
          Carried over from your Genesis search: <strong>"{prefillQuery}"</strong> — refine the pick-up below and set exact coordinates.
        </p>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="grid-2">
          <LocationField label="Pick-up" value={origin} onChange={setOrigin} />
          <LocationField label="Drop-off" value={destination} onChange={setDestination} />
        </div>
        <div className="grid-2">
          <div className="form-field">
            <label htmlFor="departureTime">Departure time</label>
            <input
              id="departureTime"
              type="datetime-local"
              required
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="seats">Seats needed</label>
            <input id="seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="pricePerSeat">Your budget per seat</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ maxWidth: 110, flex: '0 0 auto' }}
              aria-label="Currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              id="pricePerSeat"
              type="number"
              min="0"
              step="0.5"
              value={pricePerSeat}
              onChange={(e) => setPricePerSeat(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Searching…' : 'Find matches'}
        </button>
      </form>
    </div>
  );
}
