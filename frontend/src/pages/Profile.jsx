import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, ApiError } from '../services/api.js';
import PushNotificationToggle from '../components/PushNotificationToggle.jsx';
import DriverVerificationCard from '../components/DriverVerificationCard.jsx';
import PasswordField from '../components/PasswordField.jsx';

const WEIGHT_KEYS = ['proximity', 'timing', 'price', 'preferences', 'reliability'];

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const profile = user?.profile;
  const [preferences, setPreferences] = useState(profile?.preferences || {});
  const [weights, setWeights] = useState(profile?.decisionDna?.weights || {});
  const [bio, setBio] = useState(profile?.bio || '');
  const [homeCity, setHomeCity] = useState(profile?.homeCity || '');
  const [emergencyName, setEmergencyName] = useState(profile?.emergencyContactName || '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergencyContactPhone || '');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const { user: updated } = await api.updateProfile({
        bio,
        homeCity,
        preferences,
        decisionDnaWeights: weights,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone,
      });
      updateUser(updated);
      setStatus('Saved.');
    } catch (err) {
      setStatus(err.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE (all caps) to confirm.');
      return;
    }
    setDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
      logout();
      navigate('/', { state: { accountDeleted: true } });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete your account');
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <div>
      <p className="eyebrow">Your profile</p>
      <h1>{user.fullName}</h1>
      <p className="muted">{user.email}</p>

      {status && <div className="alert alert-info">{status}</div>}

      <form onSubmit={save} className="grid-2">
        <div className="card">
          <h3>About you</h3>
          <div className="form-field">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="homeCity">Home city</label>
            <input id="homeCity" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} />
          </div>

          <h3>Trusted emergency contact</h3>
          <div className="form-field">
            <label htmlFor="ecName">Contact name</label>
            <input id="ecName" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="ecPhone">Contact phone</label>
            <input id="ecPhone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3>Ride preferences</h3>
          <div className="form-field">
            <label htmlFor="chattiness">Chattiness</label>
            <select
              id="chattiness"
              value={preferences.chattiness || 'flexible'}
              onChange={(e) => setPreferences({ ...preferences, chattiness: e.target.value })}
            >
              <option value="quiet">Quiet</option>
              <option value="flexible">Flexible</option>
              <option value="chatty">Chatty</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="music">Music</label>
            <select
              id="music"
              value={preferences.music || 'flexible'}
              onChange={(e) => setPreferences({ ...preferences, music: e.target.value })}
            >
              <option value="off">Off</option>
              <option value="flexible">Flexible</option>
              <option value="on">On</option>
            </select>
          </div>
          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={!!preferences.pets_ok}
                onChange={(e) => setPreferences({ ...preferences, pets_ok: e.target.checked })}
              />{' '}
              Comfortable with pets
            </label>
          </div>
          <PushNotificationToggle />
          <div className="form-field">
            <label htmlFor="paymentMethod">Preferred payment method</label>
            <select
              id="paymentMethod"
              value={preferences.payment_method || 'card'}
              onChange={(e) => setPreferences({ ...preferences, payment_method: e.target.value })}
            >
              <option value="card">Card</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="wallet">Wallet</option>
              <option value="cash">Cash</option>
            </select>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Shown to the other party once a booking is made, so you can both coordinate how you'll settle up.
            </p>
          </div>

          <h3 style={{ marginTop: 20 }}>Decision DNA weights</h3>
          <p className="muted">Tune how much each factor influences your match scores.</p>
          {WEIGHT_KEYS.map((key) => (
            <div key={key} className="form-field">
              <label htmlFor={key}>
                {key[0].toUpperCase() + key.slice(1)} — {Math.round((weights[key] ?? 0) * 100)}%
              </label>
              <input
                id={key}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights[key] ?? 0}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>

        <div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20 }}>
        <DriverVerificationCard />
      </div>

      <div className="card" style={{ marginTop: 20, borderColor: 'var(--color-danger)' }}>
        <h3>Danger zone</h3>
        {!deleteOpen ? (
          <>
            <p className="muted">
              Permanently delete your account and personal data. Bookings and payments already made stay on
              record for financial and safety purposes, but are no longer linked to your name, email, or phone.
            </p>
            <button className="btn btn-danger" type="button" onClick={() => setDeleteOpen(true)}>
              Delete my account
            </button>
          </>
        ) : (
          <form onSubmit={handleDeleteAccount}>
            <p className="alert alert-error">
              This cannot be undone. Your profile, driver verification documents, and push subscriptions are
              deleted outright; your email and name are wiped from your account everywhere else.
            </p>
            {deleteError && <div className="alert alert-error">{deleteError}</div>}
            <PasswordField
              id="delete-password"
              label="Confirm your password"
              required
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <div className="form-field">
              <label htmlFor="delete-confirm-text">Type DELETE to confirm</label>
              <input
                id="delete-confirm-text"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" type="submit" disabled={deleting}>
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteError('');
                  setDeletePassword('');
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
