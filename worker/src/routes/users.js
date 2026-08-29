import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';
import { generateResetToken, hashResetToken } from '../lib/resetToken.js';
import { sendEmail, resetPasswordEmailHtml } from '../lib/resend.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from '../lib/rateLimit.js';

export const users = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_PREFERENCES = {
  chattiness: 'flexible',
  music: 'flexible',
  smoking: false,
  pets_ok: true,
  luggage: 'medium',
  gender_pref: 'no_preference',
  payment_method: 'card', // card | mobile_money | wallet | cash — shown to the other party once a booking exists
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

// accepted_terms_at predates this route in existing production databases;
// self-provision the column the same way tracking.js self-provisions new
// tables, so this works without waiting on a manual `wrangler d1
// migrations apply` — D1/SQLite has no `ADD COLUMN IF NOT EXISTS`, so a
// second call's "duplicate column name" error is simply swallowed.
let termsColumnEnsured = false;
async function ensureTermsColumn(db) {
  if (termsColumnEnsured) return;
  try {
    await db.exec('ALTER TABLE users ADD COLUMN accepted_terms_at TEXT');
  } catch (err) {
    if (!/duplicate column/i.test(err.message || '')) throw err;
  }
  termsColumnEnsured = true;
}

users.post('/register', registerLimiter, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, fullName, phone, acceptedTerms } = body;
  if (!email || !EMAIL_RE.test(email)) throw BadRequest('A valid email is required');
  if (!password || password.length < 8) throw BadRequest('Password must be at least 8 characters');
  if (!fullName || !fullName.trim()) throw BadRequest('Full name is required');
  if (acceptedTerms !== true) throw BadRequest('You must accept the Terms & Conditions to create an account');

  const db = c.env.DB;
  await ensureTermsColumn(db);
  const normalizedEmail = email.toLowerCase();
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(normalizedEmail).first();
  if (existing) throw Conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const id = newId('user');
  await db
    .prepare('INSERT INTO users (id, email, password_hash, full_name, phone, accepted_terms_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
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

users.post('/login', loginLimiter, async (c) => {
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

// password_resets predates this route; self-provision it the same way
// tracking.js does for page_events, so this works against the existing
// production database without a separate migration step.
let passwordResetsEnsured = false;
async function ensurePasswordResetsTable(db) {
  if (passwordResetsEnsured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  passwordResetsEnsured = true;
}

// Always responds with the same generic message whether or not the email
// matches an account — otherwise this endpoint would let anyone check
// which emails have accounts on Genesis.
users.post('/forgot-password', forgotPasswordLimiter, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { email } = body;
  if (!email || !EMAIL_RE.test(email)) throw BadRequest('A valid email is required');

  await ensurePasswordResetsTable(db);
  const genericResponse = { message: "If an account exists for that email, we've sent a reset link." };
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return c.json(genericResponse);

  const token = generateResetToken();
  const tokenHash = await hashResetToken(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await db
    .prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(newId('reset'), user.id, tokenHash, expiresAt)
    .run();

  const origin = new URL(c.req.url).origin;
  const resetUrl = `${origin}/reset-password?token=${token}`;

  if (c.env.RESEND_API_KEY) {
    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your RideShare Genesis password',
        html: resetPasswordEmailHtml({ resetUrl, fullName: user.full_name }),
        apiKey: c.env.RESEND_API_KEY,
        from: c.env.EMAIL_FROM || 'RideShare Genesis <onboarding@resend.dev>',
      });
    } catch (err) {
      console.error('[forgot-password] failed to send email:', err.message);
    }
  } else {
    console.warn('[forgot-password] RESEND_API_KEY not configured — no email sent. Reset link:', resetUrl);
  }

  await recordAuditEvent(db, { actorId: user.id, eventType: 'user.password_reset_requested', entityType: 'user', entityId: user.id });
  return c.json(genericResponse);
});

users.post('/reset-password', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { token, newPassword } = body;
  if (!token) throw BadRequest('token is required');
  if (!newPassword || newPassword.length < 8) throw BadRequest('Password must be at least 8 characters');

  await ensurePasswordResetsTable(db);
  const tokenHash = await hashResetToken(token);
  const reset = await db
    .prepare(`SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`)
    .bind(tokenHash)
    .first();
  if (!reset) throw BadRequest('This reset link is invalid or has expired');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(passwordHash, reset.user_id).run();
  await db.prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(reset.id).run();

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(reset.user_id).first();
  const profile = await getProfile(db, user.id);
  await recordAuditEvent(db, { actorId: user.id, eventType: 'user.password_reset', entityType: 'user', entityId: user.id });

  const authToken = await signToken(c.env, user);
  return c.json({ token: authToken, user: publicUser(user, profile) });
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
