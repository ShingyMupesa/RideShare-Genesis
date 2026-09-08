import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordField from '../components/PasswordField.jsx';

// Only ever redirect to a path on this same app after login — never trust
// the post-login destination as an off-origin URL. A path starting with
// "//" or "/\" can still be interpreted by some browsers as
// protocol-relative and navigate off-origin despite "looking" relative
// (the open-redirect shape recent react-router CVEs have flagged), so
// those are rejected alongside anything that isn't a genuine single-slash
// relative path.
function safeRedirectPath(path) {
  if (typeof path !== 'string') return null;
  return /^\/(?!\/|\\)/.test(path) ? path : null;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      navigate(safeRedirectPath(location.state?.from?.pathname) || '/my-journeys');
    } catch (err) {
      setError(err.message || 'Could not log in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">Welcome back</p>
      <h1>Log in</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
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
        <PasswordField
          id="password"
          label="Password"
          required
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <p style={{ marginTop: -6, marginBottom: 14, textAlign: 'right' }}>
          <Link to="/forgot-password" style={{ fontSize: '0.85rem' }}>
            Forgot password?
          </Link>
        </p>
        <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        New to Genesis? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
