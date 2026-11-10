import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

// Profile section for the Admin Team. The dashboard link only appears for
// the Owner and active Admin Team members; everyone else can ask for
// access, which the Owner approves (and assigns a role) from the dashboard.
// The server re-checks everything at sign-in, so this card is convenience,
// not the security boundary.
export default function AdminAccessCard() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminTeamStatus().then(setInfo).catch(() => setInfo({ status: 'unknown' }));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.requestAdminAccess(reason);
      setInfo({ status: 'pending' });
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Could not send your request');
    } finally {
      setBusy(false);
    }
  }

  if (!info || info.status === 'unknown') return null;
  const authorized = info.status === 'owner' || info.status === 'active';

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h3>Admin Dashboard</h3>
      {authorized ? (
        <>
          <p className="muted">
            You're on the Admin Team as <strong>{info.roleLabel}</strong>. You'll be asked for your password again when you
            open the dashboard.
          </p>
          <a className="btn btn-primary" href="/admin" target="_blank" rel="noopener noreferrer">
            Open Admin Dashboard
          </a>
        </>
      ) : info.status === 'pending' ? (
        <p className="muted">Your request to join the Admin Team is waiting for the Owner's approval.</p>
      ) : info.status === 'suspended' ? (
        <p className="muted">Your Admin Team access is suspended. Contact the Owner if you think this is a mistake.</p>
      ) : open ? (
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="adminReason">Why do you need admin access?</label>
            <textarea id="adminReason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy || reason.trim().length < 10}>
            {busy ? 'Sending…' : 'Send request to Owner'}
          </button>{' '}
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <p className="muted">The Admin Dashboard is for the Genesis Admin Team only. Access is approved by the Owner.</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Request Admin Team access
          </button>
        </>
      )}
    </div>
  );
}
