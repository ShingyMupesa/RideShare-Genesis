import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function OfferJourney() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState({ label: '', lat: '', lng: '' });
  const [destination, setDestination] = useState({ label: '', lat: '', lng: '' });
  const [departureTime, setDepartureTime] = useState('');
  const [seats, setSeats] = useState(3);
  const [pricePerSeat, setPricePerSeat] = useState(10);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [vehicleType, setVehicleType] = useState('');
  const [preferences, setPreferences] = useState({ chattiness: 'flexible', smoking: false, pets_ok: true });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/offer' } } });
      return;
    }
    setError('');
    setSuccess(null);
    setSubmitting(true);
    try {
      const { journey } = await api.createJourney({
        type: 'offer',
        origin: { ...origin, lat: Number(origin.lat), lng: Number(origin.lng) },
        destination: { ...destination, lat: Number(destination.lat), lng: Number(destination.lng) },
        departureTime: new Date(departureTime).toISOString(),
        seats: Number(seats),
        pricePerSeat: Number(pricePerSeat),
        currency,
        preferences,
        vehicleType: vehicleType || null,
      });
      setSuccess(journey);
    } catch (err) {
      setError(err.message || 'Could not publish journey');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Offer a Journey</p>
      <h1>Share your ride</h1>
      <p className="muted">Publish your route so Genesis can match you with riders heading your way.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-success">
          Journey published! View it on{' '}
          <a href={`/journeys/${success.id}`} onClick={(e) => { e.preventDefault(); navigate(`/journeys/${success.id}`); }}>
            its details page
          </a>
          .
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <div className="grid-2">
          <LocationField label="Starting point" value={origin} onChange={setOrigin} />
          <LocationField label="Destination" value={destination} onChange={setDestination} />
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
            <label htmlFor="seats">Seats available</label>
            <input id="seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-field">
            <label htmlFor="pricePerSeat">Price per seat</label>
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
          <div className="form-field">
            <label htmlFor="vehicleType">Vehicle type</label>
            <select id="vehicleType" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="electric">Electric</option>
              <option value="hybrid">Hybrid</option>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="other">Other</option>
            </select>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Helps Genesis estimate this journey's environmental impact — never affects your visibility to riders beyond the Decision DNA match score.
            </p>
          </div>
        </div>

        <h3>Journey preferences</h3>
        <div className="grid-2">
          <div className="form-field">
            <label htmlFor="chattiness">Chattiness</label>
            <select
              id="chattiness"
              value={preferences.chattiness}
              onChange={(e) => setPreferences({ ...preferences, chattiness: e.target.value })}
            >
              <option value="quiet">Quiet</option>
              <option value="flexible">Flexible</option>
              <option value="chatty">Chatty</option>
            </select>
          </div>
          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={preferences.pets_ok}
                onChange={(e) => setPreferences({ ...preferences, pets_ok: e.target.checked })}
              />{' '}
              Pets welcome
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.smoking}
                onChange={(e) => setPreferences({ ...preferences, smoking: e.target.checked })}
              />{' '}
              Smoking allowed
            </label>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Publishing…' : 'Publish journey'}
        </button>
      </form>
    </div>
  );
}
