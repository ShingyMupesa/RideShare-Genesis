import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function DataDeletion() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.requestDataDeletion(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the confirmation link');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <p className="eyebrow">Your data</p>
      <h1>Delete my account and data</h1>
      <p className="muted">
        This deletes your name, email, phone number, and driver verification documents from RideShare Genesis
        outright. Bookings and payments already made stay on record — required for financial and safety
        purposes — but are no longer linked to you personally once your account is deleted.
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Already have the app installed and logged in?</h3>
        <p className="muted">
          It's faster from your <Link to="/profile">Profile</Link> page — no email round-trip needed.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Request deletion by email</h3>
        <p className="muted">
          For anyone who can't or doesn't want to log in — including if you've already uninstalled the app.
          Enter your account email and we'll send a confirmation link; nothing is deleted until you click it.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {sent ? (
          <div className="alert alert-success">
            If an account exists for that email, we've sent a confirmation link — check your inbox (and spam
            folder). The link expires in 30 minutes.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">Account email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-danger" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Sending…' : 'Send deletion confirmation link'}
            </button>
          </form>
        )}
      </div>

      <p className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
        See the <Link to="/privacy">Privacy Policy</Link> for the full list of what's collected and how it's
        used.
      </p>
    </div>
  );
}
