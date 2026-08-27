import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import DecisionDnaCard from '../components/DecisionDnaCard.jsx';

export default function MatchResults() {
  const { journeyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [matches, setMatches] = useState(location.state?.matches || null);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(!location.state?.matches);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState({});

  useEffect(() => {
    if (matches) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api.refreshMatches(journeyId);
        setMatches(res.matches);
      } catch (err) {
        setError(err.message || 'Could not load matches');
      } finally {
        setLoading(false);
      }
    })();
  }, [journeyId, matches]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await api.refreshMatches(journeyId);
      setMatches(res.matches);
    } catch (err) {
      setError(err.message || 'Could not refresh matches');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(matchId) {
    setActionState((s) => ({ ...s, [matchId]: 'accepting' }));
    try {
      await api.acceptMatch(matchId);
      const match = matches.find((m) => m.id === matchId);
      const { booking } = await api.createBooking({ journeyId: match.offerJourney.id, matchId, seats: 1 });
      navigate(`/bookings/${booking.id}`);
    } catch (err) {
      setError(err.message || 'Could not accept match');
      setActionState((s) => ({ ...s, [matchId]: null }));
    }
  }

  async function handleDismiss(matchId) {
    setActionState((s) => ({ ...s, [matchId]: 'dismissing' }));
    try {
      await api.dismissMatch(matchId);
      setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, status: 'dismissed' } : m)));
    } catch (err) {
      setError(err.message || 'Could not dismiss match');
    } finally {
      setActionState((s) => ({ ...s, [matchId]: null }));
    }
  }

  return (
    <div>
      <p className="eyebrow">Your matches</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Genesis found these for you</h1>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Scoring candidates…</p>}
      {!loading && matches && matches.length === 0 && (
        <p className="muted">No active offers matched yet — try widening your budget or check back soon.</p>
      )}

      <div className="journey-list">
        {matches?.map((match) => {
          const offer = match.offerJourney;
          const expanded = expandedId === match.id;
          const dismissed = match.status === 'dismissed';
          return (
            <div key={match.id} className="card" style={{ opacity: dismissed ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <p className="journey-route">
                    {offer.origin.label} → {offer.destination.label}
                  </p>
                  <p className="muted">
                    {new Date(offer.departureTime).toLocaleString()} · {offer.currency} {offer.pricePerSeat}/seat ·{' '}
                    {offer.seatsAvailable} seats left
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="pill pill-primary">{Math.round(match.score * 100)}/100 match</span>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : match.id)}>
                  {expanded ? 'Hide' : 'Why this match?'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={dismissed || actionState[match.id]}
                  onClick={() => handleAccept(match.id)}
                >
                  Accept &amp; book
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={dismissed || actionState[match.id]}
                  onClick={() => handleDismiss(match.id)}
                >
                  Dismiss
                </button>
              </div>

              {expanded && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                  <DecisionDnaCard decisionDna={match.decisionDna} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
