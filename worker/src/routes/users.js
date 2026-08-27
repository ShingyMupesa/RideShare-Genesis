import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';

export const users = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_PREFERENCES = {
  chattiness: 'flexible',
  music: 'flexible',
  smoking: false,
  pets_ok: true,
  luggage: 'medium',
  gender_pref: 'no_preference',
};

const DEFAULT_DECISION_DNA = {
  weights: { proximity: 0.35, timing: 0.3, price: 0.15, preferences: 0.15, reliability: 0.05 },
};

async function getProfile(db, userId) {
  const row = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first();
  if (!row) return null;
  return { ...row, preferences: JSON.parse(row.preferences_json), decision_dna: JSON.parse(row.decision_dna_json) };
}

function publicUser(user, profile) {
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
          emergencyContactName: profile.emergency_contact_name,
          emergencyContactPhone: profile.emergency_contact_phone,
          preferences: profile.preferences,
          decisionDna: profile.decision_dna,
        }
      : null,
  };
}

users.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, fullName, phone } = body;
  if (!email || !EMAIL_RE.test(email)) throw BadRequest('A valid email is required');
  if (!password || password.length < 8) throw BadRequest('Password must be at least 8 characters');
  if (!fullName || !fullName.trim()) throw BadRequest('Full name is required');

  const db = c.env.DB;
  const normalizedEmail = email.toLowerCase();
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(normalizedEmail).first();
  if (existing) throw Conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const id = newId('user');
  await db
    .prepare('INSERT INTO users (id, email, password_hash, full_name, phone) VALUES (?, ?, ?, ?, ?)')
    .bind(id, normalizedEmail, passwordHash, fullName.trim(), phone || null)
    .run();
  await db
    .prepare('INSERT INTO profiles (user_id, preferences_json, decision_dna_json) VALUES (?, ?, ?)')
    .bind(id, JSON.stringify(DEFAULT_PREFERENCES), JSON.stringify(DEFAULT_DECISION_DNA))
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  const profile = await getProfile(db, id);

  await recordAuditEvent(db, { actorId: id, eventType: 'user.registered', entityType: 'user', entityId: id });

  const token = await signToken(c.env, user);
  return c.json({ token, user: publicUser(user, profile) }, 201);
});

users.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) throw BadRequest('Email and password are required');

  const db = c.env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) throw Unauthorized('Invalid email or password');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw Unauthorized('Invalid email or password');

  const profile = await getProfile(db, user.id);
  const token = await signToken(c.env, user);
  return c.json({ token, user: publicUser(user, profile) });
});

users.get('/me', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(authUser.id).first();
  if (!user) throw NotFound('User not found');
  const profile = await getProfile(db, user.id);
  return c.json({ user: publicUser(user, profile) });
});

users.patch('/me/profile', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { bio, homeCity, preferences, decisionDnaWeights, emergencyContactName, emergencyContactPhone } = body;

  const current = await getProfile(db, authUser.id);
  if (!current) throw NotFound('Profile not found');

  const nextPreferences = { ...current.preferences, ...(preferences || {}) };
  const nextDna = { ...current.decision_dna, weights: { ...current.decision_dna.weights, ...(decisionDnaWeights || {}) } };

  await db
    .prepare(
      `UPDATE profiles SET
        bio = COALESCE(?, bio),
        home_city = COALESCE(?, home_city),
        emergency_contact_name = COALESCE(?, emergency_contact_name),
        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
        preferences_json = ?,
        decision_dna_json = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    )
    .bind(bio ?? null, homeCity ?? null, emergencyContactName ?? null, emergencyContactPhone ?? null, JSON.stringify(nextPreferences), JSON.stringify(nextDna), authUser.id)
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(authUser.id).first();
  const profile = await getProfile(db, authUser.id);
  return c.json({ user: publicUser(user, profile) });
});

export { getProfile, publicUser };
