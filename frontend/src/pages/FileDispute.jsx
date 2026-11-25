import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';

const CATEGORIES = [
  { value: 'fare_dispute', label: 'Fare dispute' },
  { value: 'no_show', label: 'No-show' },
  { value: 'property_damage', label: 'Property damage' },
  { value: 'conduct', label: 'Conduct' },
  { value: 'other', label: 'Other' },
];

export default function FileDispute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [category, setCategory] = useState('fare_dispute');
  const [disputedAmount, setDisputedAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getBooking(id)
      .then((res) => {
        setBooking(res.booking);
        setCurrency(res.booking.currency);
        return api.paymentsForBooking(id).catch(() => ({ payments: [] }));
      })
      .then((payRes) => {
        const latest = payRes?.payments?.[0];
        if (latest) {
          setDisputedAmount(String(latest.amount));
          setCurrency(latest.currency);
        }
      })
      .catch((err) => setError(err.message || 'Could not load this booking'));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { dispute } = await api.fileDispute(id, {
        category,
        disputedAmount: disputedAmount === '' ? undefined : Number(disputedAmount),
        currency: currency || undefined,
        description: description.trim(),
      });
      setSuccess(dispute);
    } catch (err) {
      setError(err.message || 'Could not file this dispute');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Booking dispute</p>
      <h1>File a dispute</h1>
      <p className="muted">
        Tell us what went wrong with this booking — an admin reviews every dispute and can issue a refund where that applies.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-success">
          Dispute filed. We'll review it and let you know — track its status on{' '}
          <a href="/my-disputes" onClick={(e) => { e.preventDefault(); navigate('/my-disputes'); }}>
            My Disputes
          </a>
          .
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="card">
          {booking && (
            <p className="muted" style={{ marginBottom: 12 }}>
              Booking {booking.id.slice(0, 12)}… · {booking.seats} seat(s) · {booking.currency} {booking.totalPrice} total
            </p>
          )}

          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            <div className="form-field">
              <label htmlFor="disputedAmount">Disputed amount</label>
              <input
                id="disputedAmount"
                type="number"
                step="0.01"
                min="0"
                value={disputedAmount}
                onChange={(e) => setDisputedAmount(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="form-field">
              <label htmlFor="currency">Currency</label>
              <input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="e.g. KES"
                maxLength={3}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="description">What happened?</label>
            <textarea
              id="description"
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Filing…' : 'File dispute'}
          </button>
        </form>
      )}
    </div>
  );
}
