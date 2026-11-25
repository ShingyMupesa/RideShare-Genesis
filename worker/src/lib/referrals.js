// Referral codes + first-touch signup attribution.
//
// Every user gets a short, unguessable-enough share code. A signup that
// arrives through someone's link stores `referred_by`; the reward (one free
// month of Pro Driver, see grantReferralReward) is paid only when the
// referred person becomes a *verified driver* — so the reward can't be
// farmed with throwaway accounts, and it costs the platform nothing until
// a real, checked driver has joined.
import { newId } from './ids.js';
import { recordAuditEvent } from './audit.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion when read aloud
const CODE_RE = /^[A-Z0-9]{4,12}$/;

let ensured = false;
export async function ensureReferralSchema(db) {
  if (ensured) return;
  for (const stmt of [
    'ALTER TABLE users ADD COLUMN referral_code TEXT',
    'ALTER TABLE users ADD COLUMN referred_by TEXT',
    'ALTER TABLE users ADD COLUMN signup_source TEXT',
    'ALTER TABLE users ADD COLUMN signup_medium TEXT',
    'ALTER TABLE users ADD COLUMN signup_campaign TEXT',
    'ALTER TABLE users ADD COLUMN signup_landing TEXT',
  ]) {
    try {
      await db.exec(stmt);
    } catch (err) {
      if (!/duplicate column/i.test(err.message || '')) throw err;
    }
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by)');
  await db.exec(
    `CREATE TABLE IF NOT EXISTS referral_rewards (id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, referee_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, reward TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  ensured = true;
}

function randomCode(len = 7) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function getOrCreateReferralCode(db, userId) {
  await ensureReferralSchema(db);
  const row = await db.prepare('SELECT referral_code FROM users WHERE id = ?').bind(userId).first();
  if (row?.referral_code) return row.referral_code;
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      const res = await db
        .prepare('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL')
        .bind(code, userId)
        .run();
      if (res.meta?.changes) return code;
      const again = await db.prepare('SELECT referral_code FROM users WHERE id = ?').bind(userId).first();
      if (again?.referral_code) return again.referral_code;
    } catch (err) {
      if (!/UNIQUE/i.test(err.message || '')) throw err; // collision: try another code
    }
  }
  throw new Error('Could not allocate a referral code');
}

function clean(v, max = 64) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s ? s.replace(/[^\w\-./ ]/g, '') : null;
}

/** Called right after a new user row is inserted. Never throws on bad input. */
export async function recordSignupAttribution(db, userId, attribution) {
  await ensureReferralSchema(db);
  const a = attribution && typeof attribution === 'object' ? attribution : {};
  let referrerId = null;
  const ref = String(a.ref || '').trim().toUpperCase();
  if (CODE_RE.test(ref)) {
    const referrer = await db.prepare("SELECT id FROM users WHERE referral_code = ? AND status = 'active'").bind(ref).first();
    if (referrer && referrer.id !== userId) referrerId = referrer.id;
  }
  await db
    .prepare('UPDATE users SET referred_by = ?, signup_source = ?, signup_medium = ?, signup_campaign = ?, signup_landing = ? WHERE id = ?')
    .bind(referrerId, clean(a.source) || (referrerId ? 'referral' : null), clean(a.medium), clean(a.campaign), clean(a.landing, 128), userId)
    .run();
  await getOrCreateReferralCode(db, userId);
  return referrerId;
}

/**
 * Pays the referral reward once per referred user: when `refereeId` is
 * approved as a driver, whoever referred them gets one free month of the
 * cheapest active monthly Pro Driver plan (stacked onto any time they
 * already have). Idempotent via the UNIQUE referee_id.
 */
export async function grantReferralReward(db, refereeId) {
  await ensureReferralSchema(db);
  const referee = await db.prepare('SELECT referred_by FROM users WHERE id = ?').bind(refereeId).first();
  const referrerId = referee?.referred_by;
  if (!referrerId) return null;

  const plan = await db
    .prepare("SELECT * FROM driver_subscription_plans WHERE active = 1 AND billing_period = 'monthly' AND price_amount > 0 ORDER BY price_amount ASC LIMIT 1")
    .first()
    .catch(() => null);
  if (!plan) return null;

  try {
    await db
      .prepare("INSERT INTO referral_rewards (id, referrer_id, referee_id, reward) VALUES (?, ?, ?, 'pro_month')")
      .bind(newId('refrw'), referrerId, refereeId)
      .run();
  } catch (err) {
    if (/UNIQUE/i.test(err.message || '')) return null; // already rewarded
    throw err;
  }

  const current = await db
    .prepare(
      `SELECT id FROM driver_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active'
         AND ended_at IS NOT NULL AND ended_at > CURRENT_TIMESTAMP ORDER BY ended_at DESC LIMIT 1`
    )
    .bind(referrerId, plan.id)
    .first();
  let subscriptionId;
  if (current) {
    subscriptionId = current.id;
    await db.prepare("UPDATE driver_subscriptions SET ended_at = datetime(ended_at, '+1 month') WHERE id = ?").bind(current.id).run();
  } else {
    subscriptionId = newId('subscription');
    await db
      .prepare(
        `INSERT INTO driver_subscriptions (id, user_id, plan_id, status, started_at, ended_at)
         VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, datetime('now', '+1 month'))`
      )
      .bind(subscriptionId, referrerId, plan.id)
      .run();
  }
  await recordAuditEvent(db, {
    actorId: null,
    eventType: 'referral.reward_granted',
    entityType: 'driver_subscription',
    entityId: subscriptionId,
    metadata: { referrerId, refereeId, planId: plan.id, reward: 'pro_month' },
  });
  return { referrerId, subscriptionId };
}

export async function referralSummary(db, userId) {
  await ensureReferralSchema(db);
  const code = await getOrCreateReferralCode(db, userId);
  const invited = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ?').bind(userId).first();
  const rewards = await db.prepare('SELECT COUNT(*) AS n FROM referral_rewards WHERE referrer_id = ?').bind(userId).first();
  return { code, invited: Number(invited?.n || 0), verifiedDrivers: Number(rewards?.n || 0), freeMonthsEarned: Number(rewards?.n || 0) };
}

/** Growth numbers for the admin dashboard (analytics area). */
export async function growthStats(db) {
  await ensureReferralSchema(db);
  const bySource = await db
    .prepare(
      `SELECT COALESCE(signup_source, 'direct') AS source, COALESCE(signup_campaign, '') AS campaign, COUNT(*) AS signups,
              SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7
       FROM users WHERE status = 'active' GROUP BY 1, 2 ORDER BY signups DESC LIMIT 50`
    )
    .all();
  const byLanding = await db
    .prepare(
      `SELECT COALESCE(signup_landing, '(none)') AS landing, COUNT(*) AS signups FROM users WHERE status = 'active' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`
    )
    .all();
  const topReferrers = await db
    .prepare(
      `SELECT r.full_name AS name, r.referral_code AS code, COUNT(u.id) AS invited,
              (SELECT COUNT(*) FROM referral_rewards rw WHERE rw.referrer_id = r.id) AS verified
       FROM users u JOIN users r ON r.id = u.referred_by GROUP BY r.id ORDER BY invited DESC LIMIT 20`
    )
    .all();
  const { results: views } = await db
    .prepare(
      `SELECT page, COUNT(*) AS views, SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7
       FROM page_events WHERE event_type = 'page_view' AND page LIKE 'lp_%' GROUP BY page`
    )
    .all()
    .catch(() => ({ results: [] }));
  return { bySource: bySource.results, byLanding: byLanding.results, topReferrers: topReferrers.results, landingViews: views || [] };
}
