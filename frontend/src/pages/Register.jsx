import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordField from '../components/PasswordField.jsx';

const INTENT_COPY = {
  driver: { icon: '🚗', label: 'Driver — you have a spare seat', redirect: '/offer' },
  passenger: { icon: '🙋', label: 'Passenger — you need a seat', redirect: '/find' },
  both: { icon: '🔁', label: 'Both, depending on the day', redirect: '/profile' },
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intentParam = searchParams.get('intent');
  const intent = Object.prototype.hasOwnProperty.call(INTENT_COPY, intentParam) ? intentParam : null;
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('You must accept the Terms & Conditions to create an account');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await register({ ...form, acceptedTerms, travelIntent: intent });
      navigate(intent ? INTENT_COPY[intent].redirect : '/profile');
    } catch (err) {
      setError(err.message || 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">Join Genesis</p>
      <h1>Create your account</h1>
      {intent && (
        <p className="pill" style={{ marginBottom: 16 }}>
          {INTENT_COPY[intent].icon} Signing up as: {INTENT_COPY[intent].label}
        </p>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="phone">Phone (optional)</label>
          <input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <PasswordField
          id="password"
          label="Password (min 8 characters)"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 400 }}>
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I have read and agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener">
                Terms &amp; Conditions
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" rel="noopener">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting || !acceptedTerms} style={{ width: '100%' }}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already on Genesis? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
