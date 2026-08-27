import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const FLOW = ['REQUESTED', 'MATCHED', 'BOOKING_REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

const METHOD_LABELS = {
  card: { icon: '💳', label: 'Card' },
  mobile_money: { icon: '📱', label: 'Mobile Money' },
  wallet: { icon: '👛', label: 'Wallet' },
  cash: { icon: '💵', label: 'Cash' },
};

function StatusStepper({ status }) {
  if (status === 'CANCELLED') {
    return (
      <div className="status-stepper">
        <span className="status-step" style={{ background: 'rgba(214,69,69,0.15)', color: 'var(--color-danger)' }}>
          CANCELLED
        </span>
      </div>
    );
  }
  const currentIndex = FLOW.indexOf(status);
  return (
    <div className="status-stepper">
      {FLOW.map((step, i) => (
        <span key={step} className={`status-step ${i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}`}>
          {step.replace('_', ' ')}
        </span>
      ))}
    </div>
  );
}

export default function Booking() {
  const { id } = useParams();
  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [journey, setJourney] = useState(null);
  const [payments, setPayments] = useState([]);
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.getBooking(id);
    setBooking(res.booking);
    setJourney(res.journey);
    try {
      const payRes = await api.paymentsForBooking(id);
      setPayments(payRes.payments);
    } catch {
      setPayments([]);
    }
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Could not load booking'));
    api.paymentMethods().then((res) => setMethods(res.methods));
  }, [load]);

  async function runAction(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    setBusy(true);
    setError('');
    try {
      await api.pay({ bookingId: id, method: selectedMethod });
      await load();
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !booking) return <div className="alert alert-error">{error}</div>;
  if (!booking || !journey) return <p className="muted">Loading booking…</p>;

  const isPassenger = user?.id === booking.passengerId;
  const isOwner = user?.id === journey.ownerId;
  const hasCaptured = payments.some((p) => p.status === 'CAPTURED');
  const nonTerminal = !['COMPLETED', 'CANCELLED'].includes(booking.status);

  return (
    <div>
      <p className="eyebrow">Booking workflow</p>
      <h1>
        {journey.origin.label} → {journey.destination.label}
      </h1>
      <p className="muted">
        {booking.seats} seat(s) · {booking.currency} {booking.totalPrice} total
      </p>

      <StatusStepper status={booking.status} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        <div className="card">
          <h3>Actions</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isPassenger && ['REQUESTED', 'MATCHED'].includes(booking.status) && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction(() => api.requestBooking(id))}>
                Request booking
              </button>
            )}
            {isOwner && booking.status === 'BOOKING_REQUESTED' && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction(() => api.confirmBooking(id))}>
                Confirm booking
              </button>
            )}
            {booking.status === 'CONFIRMED' && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction(() => api.startBooking(id))}>
                Start trip
              </button>
            )}
            {booking.status === 'IN_PROGRESS' && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction(() => api.completeBooking(id))}>
                Complete trip
              </button>
            )}
            {nonTerminal && (
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => runAction(() => api.cancelBooking(id))}>
                Cancel
              </button>
            )}
            <Link to={`/bookings/${id}/messages`} className="btn btn-ghost btn-sm">
              Message
            </Link>
          </div>
        </div>

        <div className="card">
          <h3>Payment</h3>
          {hasCaptured ? (
            <div className="alert alert-success">Payment captured.</div>
          ) : isPassenger ? (
            <>
              <div className="method-grid">
                {methods.map((m) => (
                  <div
                    key={m}
                    className={`method-card ${selectedMethod === m ? 'selected' : ''}`}
                    onClick={() => setSelectedMethod(m)}
                  >
                    <div style={{ fontSize: '1.4rem' }}>{METHOD_LABELS[m]?.icon || '💰'}</div>
                    <div>{METHOD_LABELS[m]?.label || m}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={handlePay}>
                Pay {booking.currency} {booking.totalPrice}
              </button>
            </>
          ) : (
            <p className="muted">Waiting on the passenger to pay.</p>
          )}

          {payments.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="eyebrow">History</p>
              {payments.map((p) => (
                <p key={p.id} className="muted">
                  {p.method} · {p.status} · {p.currency} {p.amount}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
