import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send reset link');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">Reset your password</p>
      <h1>Forgot password</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {sent ? (
        <div className="alert alert-success">
          If an account exists for that email, we've sent a reset link — check your inbox (and spam folder).
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
