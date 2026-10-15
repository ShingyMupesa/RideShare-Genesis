import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

// The `driver_subscription_plans`/`driver_subscriptions` tables are
// provisioned by database/migrations/0014_driver_subscriptions.sql (applied
// by runMigrations()), consistent with this backend's convention of relying
// on real migrations rather than self-provisioning (see
// governance/platformSettings.js's equivalent note).

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

export function listActivePlans() {
  return db
    .prepare('SELECT * FROM driver_subscription_plans WHERE active = 1 ORDER BY price_amount ASC')
    .all()
    .map(deserializePlan);
}

export function listPlans() {
  return db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM driver_subscriptions s WHERE s.plan_id = p.id AND s.status = 'active') AS subscriber_count
       FROM driver_subscription_plans p
       ORDER BY p.created_at DESC`
    )
    .all()
    .map(deserializePlan);
}

export function getPlanById(id) {
  return deserializePlan(db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').get(id));
}

export function createPlan({ name, description, priceAmount, currency, billingPeriod, perks, active }) {
  const id = newId('plan');
  db.prepare(
    `INSERT INTO driver_subscription_plans (id, name, description, price_amount, currency, billing_period, perks_json, active)
     VALUES (@id, @name, @description, @price_amount, @currency, @billing_period, @perks_json, @active)`
  ).run({
    id,
    name,
    description: description || null,
    price_amount: priceAmount ?? 0,
    currency: currency || 'KES',
    billing_period: billingPeriod || 'monthly',
    perks_json: JSON.stringify(perks || []),
    active: active === false ? 0 : 1,
  });
  return getPlanById(id);
}

export function updatePlan(id, { name, description, priceAmount, currency, billingPeriod, perks, active }) {
  db.prepare(
    `UPDATE driver_subscription_plans
     SET name = ?, description = ?, price_amount = ?, currency = ?, billing_period = ?, perks_json = ?, active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(name, description || null, priceAmount, currency, billingPeriod, JSON.stringify(perks || []), active ? 1 : 0, id);
  return getPlanById(id);
}

// Soft-delete only — a plan with existing driver_subscriptions rows must
// never be hard-deleted (the FK is ON DELETE RESTRICT precisely to prevent
// that); deactivating just stops it being offered/listed publicly while
// leaving every subscription that points at it intact.
export function deactivatePlan(id) {
  db.prepare("UPDATE driver_subscription_plans SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return getPlanById(id);
}

export function listSubscriptions() {
  return db
    .prepare(
      `SELECT s.*, u.email AS user_email, u.full_name AS user_full_name, p.name AS plan_name
       FROM driver_subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN driver_subscription_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC`
    )
    .all()
    .map(deserializeSubscription);
}

export function getSubscriptionById(id) {
  return deserializeSubscription(
    db
      .prepare(
        `SELECT s.*, u.email AS user_email, u.full_name AS user_full_name, p.name AS plan_name
         FROM driver_subscriptions s
         JOIN users u ON u.id = s.user_id
         JOIN driver_subscription_plans p ON p.id = s.plan_id
         WHERE s.id = ?`
      )
      .get(id)
  );
}

// Manual assignment only — there is no self-serve driver sign-up flow since
// there's no billing to drive one yet.
export function assignSubscription({ userId, planId }) {
  const id = newId('subscription');
  db.prepare('INSERT INTO driver_subscriptions (id, user_id, plan_id, status) VALUES (?, ?, ?, ?)').run(id, userId, planId, 'active');
  return getSubscriptionById(id);
}
