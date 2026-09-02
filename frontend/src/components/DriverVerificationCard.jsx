import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import VerifiedDriverBadge from './VerifiedDriverBadge.jsx';

const EMPTY_FORM = { fullLegalName: '', licenseNumber: '', licenseExpiry: '', vehicleMakeModel: '', vehiclePlate: '' };

export default function DriverVerificationCard() {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null); // { status, updatedAt, submission }
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.myDriverVerification();
      setRecord(data);
      if (data.submission) {
        setForm({
          fullLegalName: data.submission.full_legal_name || '',
          licenseNumber: data.submission.license_number || '',
          licenseExpiry: data.submission.license_expiry || '',
          vehicleMakeModel: data.submission.vehicle_make_model || '',
          vehiclePlate: data.submission.vehicle_plate || '',
        });
      }
    } catch {
      // non-fatal — the rest of the profile page still works
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.submitDriverVerification(form);
      await load();
    } catch (err) {
      setError(err.message || 'Could not submit driver verification');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  const status = record?.status || 'unverified';

  return (
    <div className="card">
      <h3>Driver verification</h3>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        A one-time check so riders can trust who's behind the wheel. Submit your details below and an admin will review them —
        this doesn't block you from offering journeys yet, but it will once the platform turns enforcement on.
      </p>

      {status === 'verified' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <VerifiedDriverBadge />
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {record.updatedAt ? `Verified ${new Date(record.updatedAt).toLocaleDateString()}` : 'Verified'}
          </span>
        </div>
      )}

      {status === 'pending' && (
        <div className="alert alert-info" style={{ marginTop: 12 }}>
          Your details are submitted and waiting on admin review. We'll notify you the moment it's cleared.
        </div>
      )}

      {(status === 'unverified' || status === 'rejected') && (
        <>
          {status === 'rejected' && record?.submission?.review_note && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              Not approved: {record.submission.review_note} — update your details and resubmit below.
            </div>
          )}
          <form onSubmit={submit} style={{ marginTop: 12 }}>
            <div className="form-field">
              <label htmlFor="dvFullName">Full legal name</label>
              <input
                id="dvFullName"
                required
                value={form.fullLegalName}
                onChange={(e) => setForm({ ...form, fullLegalName: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dvLicense">Driver's license number</label>
              <input
                id="dvLicense"
                required
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dvExpiry">License expiry (optional)</label>
              <input
                id="dvExpiry"
                type="date"
                value={form.licenseExpiry || ''}
                onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dvVehicle">Vehicle make &amp; model (optional)</label>
              <input
                id="dvVehicle"
                value={form.vehicleMakeModel}
                onChange={(e) => setForm({ ...form, vehicleMakeModel: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dvPlate">Vehicle plate number</label>
              <input
                id="dvPlate"
                required
                value={form.vehiclePlate}
                onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
              />
            </div>
            {error && <p className="alert alert-error">{error}</p>}
            <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
