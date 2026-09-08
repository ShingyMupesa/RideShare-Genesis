import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import VerifiedDriverBadge from '../components/VerifiedDriverBadge.jsx';

function toOfferPrefillQuery(journey) {
  const params = new URLSearchParams();
  if (journey.origin?.label) params.set('originLabel', journey.origin.label);
  if (journey.destination?.label) params.set('destLabel', journey.destination.label);
  if (journey.departureTime) params.set('departureTime', journey.departureTime);
  return params.toString();
}

export default function BrowseJourneys() {
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.listJourneys('?type=offer&status=active'), api.listJourneys('?type=request&status=active')])
      .then(([offerRes, requestRes]) => {
        setOffers(offerRes.journeys);
        setRequests(requestRes.journeys);
      })
      .catch((err) => setError(err.message || 'Could not load journeys'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="eyebrow">Browse</p>
      <h1>What's available right now</h1>
      <p className="muted">
        See who's offering a ride and who's looking for one — free to drive? Post a matching offer straight from a request below.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div>
            <h3>Available Offered Journeys ({offers.length})</h3>
            <div className="journey-list">
              {offers.length === 0 && <p className="muted">No active offers right now.</p>}
              {offers.map((j) => (
                <Link key={j.id} to={`/journeys/${j.id}`} className="journey-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div>
                    <p className="journey-route" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {j.origin.label} → {j.destination.label}
                      {j.ownerDriverVerified && <VerifiedDriverBadge />}
                    </p>
                    <p className="muted">
                      {new Date(j.departureTime).toLocaleString()} · {j.currency} {j.pricePerSeat}/seat
                    </p>
                  </div>
                  <span className="pill pill-success">{j.seatsAvailable}/{j.seatsTotal} seats</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3>Available Requested Journeys ({requests.length})</h3>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: -8, marginBottom: 12 }}>
              Route and terms only — exact pickup points stay private to the rider until you're matched.
            </p>
            <div className="journey-list">
              {requests.length === 0 && <p className="muted">No open requests right now.</p>}
              {requests.map((j) => (
                <div key={j.id} className="journey-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <p className="journey-route">
                        {j.origin.label} → {j.destination.label}
                      </p>
                      <p className="muted">
                        {new Date(j.departureTime).toLocaleString()} · {j.currency} {j.pricePerSeat}/seat · {j.seatsTotal} seat(s) needed
                      </p>
                    </div>
                    <span className="pill">{j.status}</span>
                  </div>
                  <Link to={`/offer?${toOfferPrefillQuery(j)}`} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                    Post a matching offer
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
