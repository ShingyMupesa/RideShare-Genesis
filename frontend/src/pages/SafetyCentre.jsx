import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const CATEGORIES = [
  { value: 'incident_report', label: 'Incident report' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'feedback', label: 'General feedback' },
];

export default function SafetyCentre() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [trustedContact, setTrustedContact] = useState(null);
  const [category, setCategory] = useState('safety_concern');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sosSending, setSosSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.mySafetyCases().then((res) => setCases(res.safetyCases)).catch(() => {});
    api.trustedContact().then(setTrustedContact).catch(() => {});
  }, [user]);

  async function handleSOS() {
    if (!user) return;
    setSosSending(true);
    setError('');
    try {
      const res = await api.triggerSOS({ description: 'SOS triggered from Safety Centre' });
      setStatus(res.guidance);
      setCases((prev) => [res.safetyCase, ...prev]);
    } catch (err) {
      setError(err.message || 'Could not send SOS');
    } finally {
      setSosSending(false);
    }
  }

  async function handleReport(e) {
    e.preventDefault();
    if (!user) return;
    setError('');
    try {
      const res = await api.fileSafetyReport({ category, severity, description });
      setCases((prev) => [res.safetyCase, ...prev]);
      setDescription('');
      setStatus('Report filed. Thank you for keeping Genesis safe.');
    } catch (err) {
      setError(err.message || 'Could not file report');
    }
  }

  return (
    <div>
      <p className="eyebrow">Safety Centre</p>
      <h1>You're never alone on Genesis</h1>
      <p className="muted">
        Every SOS and report is logged immediately and backed by our governance audit trail.
      </p>

      {status && <div className="alert alert-success">{status}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        <div className="card">
          <h3>Emergency SOS</h3>
          <p className="muted">
            One tap logs an incident instantly and shares it with your trusted contact.
          </p>
          <button className="btn btn-danger" onClick={handleSOS} disabled={!user || sosSending}>
            {sosSending ? 'Sending…' : '🆘 Trigger SOS'}
          </button>
          {!user && <p className="muted" style={{ marginTop: 8 }}>Log in to trigger SOS.</p>}

          {trustedContact && (trustedContact.emergencyContactName || trustedContact.emergencyContactPhone) && (
            <div style={{ marginTop: 16 }}>
              <p className="eyebrow">Trusted contact</p>
              <p>
                {trustedContact.emergencyContactName || 'Not set'} ·{' '}
                {trustedContact.emergencyContactPhone || 'no phone on file'}
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3>File a report</h3>
          <form onSubmit={handleReport}>
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
            <div className="form-field">
              <label htmlFor="severity">Severity</label>
              <select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="description">What happened?</label>
              <textarea
                id="description"
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={!user}>
              Submit report
            </button>
          </form>
        </div>
      </div>

      {user && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Your case history</h3>
          {cases.length === 0 && <p className="muted">No cases filed.</p>}
          {cases.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span className="pill pill-primary">{c.category}</span>{' '}
              <span className="pill">{c.severity}</span>{' '}
              <span className="pill pill-success">{c.status}</span>
              <p className="muted" style={{ marginTop: 4 }}>{c.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
