import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const WEIGHT_KEYS = ['proximity', 'timing', 'price', 'preferences', 'reliability'];

export default function Profile() {
  const { user, updateUser } = useAuth();
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
    </div>
  );
}
