import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

const DEFAULT_PREFERENCES = {
  chattiness: 'flexible', // quiet | flexible | chatty
  music: 'flexible',
  smoking: false,
  pets_ok: true,
  luggage: 'medium',
  gender_pref: 'no_preference',
  payment_method: 'card', // card | mobile_money | wallet | cash — shown to the other party once a booking exists
};

const DEFAULT_DECISION_DNA = {
  // Weights (0-1) the matching engine uses to personalise scoring for this
  // rider. Sums do not need to equal 1 — they are relative importances.
  weights: {
    proximity: 0.35,
    timing: 0.3,
    price: 0.15,
    preferences: 0.15,
    reliability: 0.05,
  },
};

export function createUser({ email, passwordHash, fullName, phone }) {
  const id = newId('user');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, phone, accepted_terms_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).run(id, email, passwordHash, fullName, phone || null);

  db.prepare(
    `INSERT INTO profiles (user_id, preferences_json, decision_dna_json) VALUES (?, ?, ?)`
  ).run(id, JSON.stringify(DEFAULT_PREFERENCES), JSON.stringify(DEFAULT_DECISION_DNA));

  return getUserById(id);
}

export function findUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
}

export function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function getProfile(userId) {
  const row = db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId);
  if (!row) return null;
  return {
    ...row,
    preferences: JSON.parse(row.preferences_json),
    decision_dna: JSON.parse(row.decision_dna_json),
  };
}

export function updateProfile(userId, { bio, homeCity, preferences, decisionDnaWeights, emergencyContactName, emergencyContactPhone }) {
  const current = getProfile(userId);
  if (!current) return null;

  const nextPreferences = { ...current.preferences, ...(preferences || {}) };
  const nextDna = {
    ...current.decision_dna,
    weights: { ...current.decision_dna.weights, ...(decisionDnaWeights || {}) },
  };

  db.prepare(
    `UPDATE profiles SET
      bio = COALESCE(?, bio),
      home_city = COALESCE(?, home_city),
      emergency_contact_name = COALESCE(?, emergency_contact_name),
      emergency_contact_phone = COALESCE(?, emergency_contact_phone),
      preferences_json = ?,
      decision_dna_json = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`
  ).run(bio ?? null, homeCity ?? null, emergencyContactName ?? null, emergencyContactPhone ?? null, JSON.stringify(nextPreferences), JSON.stringify(nextDna), userId);

  return getProfile(userId);
}

export function updatePasswordHash(userId, passwordHash) {
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(passwordHash, userId);
}

export function createPasswordReset(userId, tokenHash, expiresAt) {
  const id = newId('reset');
  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).run(id, userId, tokenHash, expiresAt);
  return id;
}

export function findValidPasswordReset(tokenHash) {
  return db
    .prepare(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
    )
    .get(tokenHash);
}

export function markPasswordResetUsed(id) {
  db.prepare(`UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function publicUser(user, profile) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    createdAt: user.created_at,
    profile: profile
      ? {
          bio: profile.bio,
          avatarColor: profile.avatar_color,
          homeCity: profile.home_city,
          verifiedId: !!profile.verified_id,
          verifiedEmail: !!profile.verified_email,
          driverVerificationStatus: profile.driver_verification_status || 'unverified',
          driverVerificationUpdatedAt: profile.driver_verification_updated_at || null,
          emergencyContactName: profile.emergency_contact_name,
          emergencyContactPhone: profile.emergency_contact_phone,
          preferences: profile.preferences,
          decisionDna: profile.decision_dna,
        }
      : null,
  };
}
