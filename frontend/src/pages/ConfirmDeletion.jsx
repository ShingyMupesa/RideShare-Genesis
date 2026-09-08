import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ConfirmDeletion() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setError('');
    setConfirming(true);
    try {
      await api.confirmDataDeletion(token);
      setDone(true);
    } catch (err) {
      setError(err.message || 'This deletion link is invalid or has expired');
    } finally {
      setConfirming(false);
    }
  }

  if (!token) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="alert alert-error">This link is missing its token — use the link from your email.</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/data-deletion">Request a new deletion link</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="alert alert-success">Your account and personal data have been deleted.</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/">Back to RideShare Genesis</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">Confirm deletion</p>
      <h1>This cannot be undone</h1>
      <p className="muted">
        Confirming permanently deletes your name, email, phone number, and driver verification documents from
        RideShare Genesis. Bookings and payments already made stay on record but are no longer linked to you.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-danger" type="button" onClick={handleConfirm} disabled={confirming} style={{ width: '100%' }}>
        {confirming ? 'Deleting…' : 'Permanently delete my account'}
      </button>
    </div>
  );
}
