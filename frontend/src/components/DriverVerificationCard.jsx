import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { compressImageToDataUrl } from '../utils/imageCompress.js';
import VerifiedDriverBadge from './VerifiedDriverBadge.jsx';

const EMPTY_FORM = {
  fullLegalName: '',
  licenseNumber: '',
  licenseExpiry: '',
  vehicleMakeModel: '',
  vehiclePlate: '',
  licensePhoto: null,
  vehicleRegPhoto: null,
  insurancePolicyNumber: '',
  insuranceExpiry: '',
  insurancePhoto: null,
};

function PhotoField({ id, label, required, value, onChange, existingPhotoUrl }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err.message || 'Could not process that image');
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  const preview = value || existingPhotoUrl;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label} {!required && '(optional)'}
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" onChange={handleFile} required={required && !value && !existingPhotoUrl} />
      {busy && <p className="muted" style={{ fontSize: '0.78rem' }}>Compressing…</p>}
      {error && <p className="alert alert-error" style={{ fontSize: '0.8rem' }}>{error}</p>}
      {preview && (
        <img
          src={preview}
          alt={`${label} preview`}
          style={{ marginTop: 8, maxWidth: 160, maxHeight: 110, borderRadius: 8, border: '1px solid var(--color-border)', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}

export default function DriverVerificationCard() {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null); // { status, updatedAt, submission }
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [existingPhotoUrls, setExistingPhotoUrls] = useState({ license: null, vehicleReg: null, insurance: null });
  const createdObjectUrls = useRef([]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.myDriverVerification();
      setRecord(data);
      if (data.submission) {
        setForm((prev) => ({
          ...prev,
          fullLegalName: data.submission.full_legal_name || '',
          licenseNumber: data.submission.license_number || '',
          licenseExpiry: data.submission.license_expiry || '',
          vehicleMakeModel: data.submission.vehicle_make_model || '',
          vehiclePlate: data.submission.vehicle_plate || '',
          insurancePolicyNumber: data.submission.insurance_policy_number || '',
          insuranceExpiry: data.submission.insurance_expiry || '',
        }));
        loadExistingPhoto(data.submission.id, 'license', data.submission.license_photo_key);
        loadExistingPhoto(data.submission.id, 'vehicleReg', data.submission.vehicle_reg_photo_key);
        loadExistingPhoto(data.submission.id, 'insurance', data.submission.insurance_photo_key);
      }
    } catch {
      // non-fatal — the rest of the profile page still works
    } finally {
      setLoading(false);
    }
  }

  async function loadExistingPhoto(submissionId, which, key) {
    if (!key) return;
    try {
      const blob = await api.driverVerificationPhotoBlob(submissionId, which);
      const url = URL.createObjectURL(blob);
      createdObjectUrls.current.push(url);
      setExistingPhotoUrls((prev) => ({ ...prev, [which]: url }));
    } catch {
      // non-fatal — the form still works without the preview
    }
  }

  useEffect(() => {
    load();
    return () => {
      createdObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.licensePhoto) {
      setError("A photo of your driver's license is required");
      return;
    }
    if (!form.insurancePhoto) {
      setError('A photo of your vehicle insurance is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitDriverVerification(form);
      setForm((prev) => ({ ...prev, licensePhoto: null, vehicleRegPhoto: null, insurancePhoto: null }));
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
        A one-time check so riders can trust who's behind the wheel. Submit photos of your license and vehicle insurance
        (plus your vehicle registration, if you have it) and an admin will review them — this doesn't block you from
        offering journeys yet, but it will once the platform turns enforcement on.
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
            <PhotoField
              id="dvLicensePhoto"
              label="Photo of your driver's license"
              required
              value={form.licensePhoto}
              existingPhotoUrl={existingPhotoUrls.license}
              onChange={(dataUrl) => setForm((prev) => ({ ...prev, licensePhoto: dataUrl }))}
            />
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
            <PhotoField
              id="dvVehicleRegPhoto"
              label="Photo of vehicle registration"
              value={form.vehicleRegPhoto}
              existingPhotoUrl={existingPhotoUrls.vehicleReg}
              onChange={(dataUrl) => setForm((prev) => ({ ...prev, vehicleRegPhoto: dataUrl }))}
            />
            <div className="form-field">
              <label htmlFor="dvInsurancePolicy">Insurance policy number (optional)</label>
              <input
                id="dvInsurancePolicy"
                value={form.insurancePolicyNumber}
                onChange={(e) => setForm({ ...form, insurancePolicyNumber: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dvInsuranceExpiry">Insurance expiry (optional)</label>
              <input
                id="dvInsuranceExpiry"
                type="date"
                value={form.insuranceExpiry || ''}
                onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })}
              />
            </div>
            <PhotoField
              id="dvInsurancePhoto"
              label="Photo of vehicle insurance"
              required
              value={form.insurancePhoto}
              existingPhotoUrl={existingPhotoUrls.insurance}
              onChange={(dataUrl) => setForm((prev) => ({ ...prev, insurancePhoto: dataUrl }))}
            />
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
