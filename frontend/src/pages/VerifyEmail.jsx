import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState(token ? 'verifying' : 'missing');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api.verifyEmail(token);
        if (cancelled) return;
        setStatus('done');
        if (user) await refresh();
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'This verification link is invalid or has expired');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user, refresh]);

  if (status === 'missing') {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="alert alert-error">This link is missing its token — use the link from your email.</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/profile">Back to your profile</Link>
        </p>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="alert alert-success">Your email is verified. Thanks!</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/">Back to RideShare Genesis</Link>
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="alert alert-error">{error}</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/profile">Request a new link from your profile</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">Verify email</p>
      <h1>Confirming…</h1>
      <p className="muted">Hang on while we verify your email address.</p>
    </div>
  );
}
