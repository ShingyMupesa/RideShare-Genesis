import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';

// Driver subscription plans + the (admin-assigned-only) subscriptions
// pointing at them. Config-only: there is no billing integration behind any
// of this yet — see the admin screen's copy (screens/monetisation.js) and
// the plan doc's "Scope" section for the framing this mirrors.

export const monetizationPublic = new Hono();
export const subscriptionPlans = new Hono();
export const subscriptions = new Hono();

const BILLING_PERIODS = ['monthly', 'weekly', 'yearly'];

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so each CREATE TABLE has to stay on one line — see
// tracking.js/disputes.js for the same pattern. Real migrations
// (worker/migrations/0015_driver_subscriptions.sql) cover fresh
// environments; this is the safety net for an already-existing production DB.
async function ensureSubscriptionTables(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS driver_subscription_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, price_amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'KES', billing_period TEXT NOT NULL DEFAULT 'monthly', perks_json TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS driver_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES driver_subscription_plans(id) ON DELETE RESTRICT, status TEXT NOT NULL DEFAULT 'active', started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), ended_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_driver_subscriptions_user ON driver_subscriptions(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_driver_subscriptions_plan ON driver_subscriptions(plan_id)');
}

function parsePerks(perksJson) {
  try {
    const parsed = JSON.parse(perksJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deserializePlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceAmount: row.price_amount,
    currency: row.currency,
    billingPeriod: row.billing_period,
    perks: parsePerks(row.perks_json),
    active: !!row.active,
    subscriberCount: row.subscriber_count != null ? Number(row.subscriber_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deserializeSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userFullName: row.user_full_name,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

function normalizePerks(perks) {
  if (perks === undefined || perks === null) return [];
  if (Array.isArray(perks)) return perks.map((p) => String(p));
  throw BadRequest('perks must be an array of strings');
}

// ---- Public: marketing-page list, active plans only -----------------------

monetizationPublic.get('/plans', async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);
  const { results } = await db
    .prepare('SELECT * FROM driver_subscription_plans WHERE active = 1 ORDER BY price_amount ASC')
    .all();
  return c.json({ plans: results.map(deserializePlan) });
});

// ---- Admin: subscription plan CRUD (soft-delete via active=0) ------------

subscriptionPlans.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);
  // Subscriber count is "currently active" assignments only, so a plan that
  // still has historical (ended) subscriptions doesn't look falsely busy.
  const { results } = await db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM driver_subscriptions s WHERE s.plan_id = p.id AND s.status = 'active') AS subscriber_count
       FROM driver_subscription_plans p
       ORDER BY p.created_at DESC`
    )
    .all();
  return c.json({ plans: results.map(deserializePlan) });
});

subscriptionPlans.post('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);

  const body = await c.req.json().catch(() => ({}));
  const { name, description, priceAmount, currency, billingPeriod, perks, active } = body;
  if (!name || !String(name).trim()) throw BadRequest('name is required');
  if (billingPeriod && !BILLING_PERIODS.includes(billingPeriod)) {
    throw BadRequest(`billingPeriod must be one of: ${BILLING_PERIODS.join(', ')}`);
  }
  const perksList = normalizePerks(perks);

  const id = newId('plan');
  await db
    .prepare(
      `INSERT INTO driver_subscription_plans (id, name, description, price_amount, currency, billing_period, perks_json, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      String(name).trim(),
      description || null,
      priceAmount !== undefined && priceAmount !== null ? Number(priceAmount) : 0,
      currency || 'KES',
      billingPeriod || 'monthly',
      JSON.stringify(perksList),
      active === false ? 0 : 1
    )
    .run();

  const plan = deserializePlan(await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'subscription_plan.created',
    entityType: 'subscription_plan',
    entityId: id,
    metadata: { name: plan.name, priceAmount: plan.priceAmount, currency: plan.currency },
  });

  return c.json({ plan }, 201);
});

subscriptionPlans.put('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Subscription plan not found');

  const body = await c.req.json().catch(() => ({}));
  const { name, description, priceAmount, currency, billingPeriod, perks, active } = body;
  if (billingPeriod && !BILLING_PERIODS.includes(billingPeriod)) {
    throw BadRequest(`billingPeriod must be one of: ${BILLING_PERIODS.join(', ')}`);
  }

  const next = {
    name: name !== undefined ? String(name).trim() : existing.name,
    description: description !== undefined ? description : existing.description,
    price_amount: priceAmount !== undefined ? Number(priceAmount) : existing.price_amount,
    currency: currency !== undefined ? currency : existing.currency,
    billing_period: billingPeriod !== undefined ? billingPeriod : existing.billing_period,
    perks_json: perks !== undefined ? JSON.stringify(normalizePerks(perks)) : existing.perks_json,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
  };
  if (!next.name) throw BadRequest('name is required');

  await db
    .prepare(
      `UPDATE driver_subscription_plans
       SET name = ?, description = ?, price_amount = ?, currency = ?, billing_period = ?, perks_json = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(next.name, next.description, next.price_amount, next.currency, next.billing_period, next.perks_json, next.active, id)
    .run();

  const plan = deserializePlan(await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'subscription_plan.updated',
    entityType: 'subscription_plan',
    entityId: id,
    metadata: { name: plan.name },
  });

  return c.json({ plan });
});

subscriptionPlans.delete('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Subscription plan not found');

  // Soft-delete only — a plan with existing driver_subscriptions rows must
  // never be hard-deleted (the FK is ON DELETE RESTRICT precisely to
  // prevent that); deactivating just stops it being offered/listed publicly
  // while leaving every subscription that points at it intact.
  await db
    .prepare("UPDATE driver_subscription_plans SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(id)
    .run();

  const plan = deserializePlan(await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'subscription_plan.deactivated',
    entityType: 'subscription_plan',
    entityId: id,
    metadata: { name: existing.name },
  });

  return c.json({ plan });
});

// ---- Admin: who's assigned to what (read-only + manual assignment) -------

subscriptions.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);

  const { results } = await db
    .prepare(
      `SELECT s.*, u.email AS user_email, u.full_name AS user_full_name, p.name AS plan_name
       FROM driver_subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN driver_subscription_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC`
    )
    .all();

  return c.json({ subscriptions: results.map(deserializeSubscription) });
});

// Manual assignment only — there is no self-serve driver sign-up flow since
// there's no billing to drive one yet. An admin picks a user + plan here;
// nothing is charged.
subscriptions.post('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureSubscriptionTables(db);

  const body = await c.req.json().catch(() => ({}));
  const { userId, planId } = body;
  if (!userId) throw BadRequest('userId is required');
  if (!planId) throw BadRequest('planId is required');

  const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!user) throw NotFound('User not found');
  const plan = await db.prepare('SELECT id FROM driver_subscription_plans WHERE id = ?').bind(planId).first();
  if (!plan) throw NotFound('Subscription plan not found');

  const id = newId('subscription');
  await db
    .prepare('INSERT INTO driver_subscriptions (id, user_id, plan_id, status) VALUES (?, ?, ?, ?)')
    .bind(id, userId, planId, 'active')
    .run();

  const subscription = deserializeSubscription(
    await db
      .prepare(
        `SELECT s.*, u.email AS user_email, u.full_name AS user_full_name, p.name AS plan_name
         FROM driver_subscriptions s
         JOIN users u ON u.id = s.user_id
         JOIN driver_subscription_plans p ON p.id = s.plan_id
         WHERE s.id = ?`
      )
      .bind(id)
      .first()
  );

  await recordAuditEvent(db, {
    eventType: 'driver_subscription.assigned',
    entityType: 'driver_subscription',
    entityId: id,
    metadata: { userId, planId },
  });

  return c.json({ subscription }, 201);
});

export { ensureSubscriptionTables };
