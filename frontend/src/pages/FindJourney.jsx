import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { CURRENCIES, DEFAULT_CURRENCY } from '../constants/currencies.js';

const PRESETS = [
  { label: 'Downtown Plaza', lat: -1.2921, lng: 36.8219 },
  { label: 'Airport Terminal', lat: -1.3192, lng: 36.9278 },
  { label: 'University Campus', lat: -1.2635, lng: 36.8121 },
  { label: 'Tech Park', lat: -1.2167, lng: 36.8956 },
];

function LocationField({ label, value, onChange }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input
        placeholder="Place name"
        value={value.label}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        style={{ marginBottom: 6 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={value.lat}
          onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })}
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={value.lng}
          onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="pill"
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => onChange(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
