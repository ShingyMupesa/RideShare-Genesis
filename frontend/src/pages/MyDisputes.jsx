import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const STATUS_PILL = {
  open: 'pill-warning',
  under_review: 'pill-primary',
  resolved_refunded: 'pill-success',
  resolved_denied: 'pill-danger',
  resolved_other: 'pill',
};

const CATEGORY_LABELS = {
  fare_dispute: 'Fare dispute',
  no_show: 'No-show',
  property_damage: 'Property damage',
  conduct: 'Conduct',
  other: 'Other',
};

export default function MyDisputes() {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .myDisputes()
      .then((res) => setDisputes(res.disputes))
      .catch((err) => setError(err.message || 'Could not load your disputes'));
  }, []);

  return (
    <div>
      <p className="eyebrow">My Disputes</p>
      <h1>Disputes you've filed or are named in</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="journey-list">
        {disputes.length === 0 && <p className="muted">No disputes filed yet — these show up once you file one from a booking's page.</p>}
        {disputes.map((d) => (
          <Link key={d.id} to={`/bookings/${d.bookingId}`} className="journey-row" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div>
              <p className="journey-route">
                {CATEGORY_LABELS[d.category] || d.category}
                {d.filedBy === user?.id ? ' · filed by you' : ' · filed against you'}
              </p>
              <p className="muted">
                Booking {d.bookingId.slice(0, 12)}…
                {d.disputedAmount != null && ` · ${d.currency || ''} ${d.disputedAmount}`} · {new Date(d.createdAt).toLocaleString()}
              </p>
              {d.resolutionNote && <p className="muted">Resolution: {d.resolutionNote}</p>}
            </div>
            <span className={`pill ${STATUS_PILL[d.status] || 'pill'}`}>{d.status.replace('_', ' ')}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
