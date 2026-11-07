import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';
import { createPaymentIntent, retrievePaymentIntent } from '../lib/stripe.js';
import { initiateStkPush, queryStkPushStatus, parseCallbackMetadata } from '../lib/mpesa.js';
import { mpesaLimiter } from '../lib/rateLimit.js';
import { ensureSubscriptionTables } from './monetization.js';
import { requireAdmin } from '../lib/adminAuth.js';

// Self-serve, paid driver subscriptions ("Genesis Pro Driver").
//
// A driver picks a plan, pays for it by card (Stripe) or M-Pesa, and the
// subscription is only activated once the payment is verified server-side
// with the provider — never on the client's say-so. Each successful payment
// buys exactly one billing period; paying again before it ends extends it.
// The perk that makes this worth paying for is real and enforced in
// payments.js: subscribers pay the plan's lower commission rate on every
// ride they drive while the subscription is current.

export const driverBilling = new Hono();

const PERIOD_MODIFIER = { weekly: '+7 days', monthly: '+1 month', yearly: '+1 year' };

// Launch plans, seeded once into an empty plans table so the Pro page has
// something to sell the moment this deploys. Admins can edit or deactivate
// them from the Monetisation screen like any other plan.
const DEFAULT_PLANS = [
  {
    name: 'Pro Driver — Monthly',
    description: 'Pay 5% commission instead of 10% on every ride you drive.',
    priceAmount: 500,
    billingPeriod: 'monthly',
    commissionRatePct: 5,
    perks: ['5% commission instead of 10%', 'Keep 95% of every fare'],
  },
  {
    name: 'Pro Driver — Yearly',
    description: 'Everything in Monthly, two months free.',
    priceAmount: 5000,
    billingPeriod: 'yearly',
    commissionRatePct: 5,
    perks: ['5% commission instead of 10%', 'Keep 95% of every fare', '2 months free vs monthly'],
  },
];

let billingEnsured = false;
export async function ensureBillingTables(db) {
  await ensureSubscriptionTables(db);
  if (billingEnsured) return;
  try {
    await db.exec('ALTER TABLE driver_subscription_plans ADD COLUMN commission_rate_pct REAL');
  } catch (err) {
    if (!/duplicate column/i.test(err.message || '')) throw err;
  }
  await db.exec(
    `CREATE TABLE IF NOT EXISTS subscription_payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES driver_subscription_plans(id) ON DELETE RESTRICT, method TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', reference TEXT, subscription_id TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id)');

  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM driver_subscription_plans').first();
  if (Number(n) === 0) {
    for (const p of DEFAULT_PLANS) {
      await db
        .prepare(
          `INSERT INTO driver_subscription_plans (id, name, description, price_amount, currency, billing_period, perks_json, active, commission_rate_pct)
           VALUES (?, ?, ?, ?, 'KES', ?, ?, 1, ?)`
        )
        .bind(newId('plan'), p.name, p.description, p.priceAmount, p.billingPeriod, JSON.stringify(p.perks), p.commissionRatePct)
        .run();
    }
  }
  billingEnsured = true;
}

/**
 * The commission percentage a driver's current subscription entitles them
 * to, or null if they have no current subscription with a commission perk.
 * Used by payments.js; the caller takes the lower of this and the platform
 * rate, so a plan can never *raise* a driver's commission.
 */
export async function subscriberCommissionPct(db, userId) {
  if (!userId) return null;
  await ensureBillingTables(db);
  const row = await db
    .prepare(
      `SELECT MIN(p.commission_rate_pct) AS pct
       FROM driver_subscriptions s JOIN driver_subscription_plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active' AND p.commission_rate_pct IS NOT NULL
         AND (s.ended_at IS NULL OR s.ended_at > CURRENT_TIMESTAMP)`
    )
    .bind(userId)
    .first();
  return row?.pct != null ? Number(row.pct) : null;
}

function mpesaConfigFromEnv(env) {
  return {
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortcode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    environment: env.MPESA_ENV || 'sandbox',
  };
}
const mpesaEnabled = (env) => {
  const c = mpesaConfigFromEnv(env);
  return !!(c.consumerKey && c.consumerSecret && c.shortcode && c.passkey);
};

async function getActivePlan(db, planId) {
  if (!planId) throw BadRequest('planId is required');
  const plan = await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ? AND active = 1').bind(planId).first();
  if (!plan) throw NotFound('Plan not found or no longer offered');
  if (!(plan.price_amount > 0)) throw BadRequest('This plan has no price to pay');
  if (!PERIOD_MODIFIER[plan.billing_period]) throw BadRequest('This plan has an unsupported billing period');
  return plan;
}

async function createSubscriptionPayment(db, { userId, plan, method }) {
  const id = newId('subpay');
  await db
    .prepare(
      `INSERT INTO subscription_payments (id, user_id, plan_id, method, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`
    )
    .bind(id, userId, plan.id, method, plan.price_amount, plan.currency)
    .run();
  return id;
}

async function setPaymentStatus(db, id, status, reference) {
  await db
    .prepare('UPDATE subscription_payments SET status = ?, reference = COALESCE(?, reference), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, reference || null, id)
    .run();
}

/**
 * Marks a verified subscription payment CAPTURED and grants one billing
 * period. Idempotent: the conditional UPDATE means only the first of a
 * callback/poll race actually activates anything.
 */
async function activateFromPayment(db, payment, meta = {}) {
  const claimed = await db
    .prepare("UPDATE subscription_payments SET status = 'CAPTURED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'")
    .bind(payment.id)
    .run();
  if (!claimed.meta?.changes) return;

  const plan = await db.prepare('SELECT * FROM driver_subscription_plans WHERE id = ?').bind(payment.plan_id).first();
  const modifier = PERIOD_MODIFIER[plan?.billing_period] || '+1 month';

  // Renewal of the same plan stacks onto the time already paid for.
  const current = await db
    .prepare(
      `SELECT * FROM driver_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active'
         AND ended_at IS NOT NULL AND ended_at > CURRENT_TIMESTAMP ORDER BY ended_at DESC LIMIT 1`
    )
    .bind(payment.user_id, payment.plan_id)
    .first();

  let subscriptionId;
  if (current) {
    subscriptionId = current.id;
    await db.prepare('UPDATE driver_subscriptions SET ended_at = datetime(ended_at, ?) WHERE id = ?').bind(modifier, current.id).run();
  } else {
    subscriptionId = newId('subscription');
    await db
      .prepare(
        `INSERT INTO driver_subscriptions (id, user_id, plan_id, status, started_at, ended_at)
         VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, datetime('now', ?))`
      )
      .bind(subscriptionId, payment.user_id, payment.plan_id, modifier)
      .run();
  }
  await db.prepare('UPDATE subscription_payments SET subscription_id = ? WHERE id = ?').bind(subscriptionId, payment.id).run();

  await recordAuditEvent(db, {
    actorId: payment.user_id,
    eventType: 'driver_subscription.paid',
    entityType: 'driver_subscription',
    entityId: subscriptionId,
    metadata: { planId: payment.plan_id, amount: payment.amount, currency: payment.currency, method: payment.method, ...meta },
  });
}

async function getOwnPayment(db, id, userId) {
  const payment = await db.prepare('SELECT * FROM subscription_payments WHERE id = ?').bind(id).first();
  if (!payment) throw NotFound('Subscription payment not found');
  if (payment.user_id !== userId) throw Forbidden('You do not have access to this payment');
  return payment;
}

function serializePayment(p) {
  return { id: p.id, planId: p.plan_id, method: p.method, amount: p.amount, currency: p.currency, status: p.status, createdAt: p.created_at };
}

// ---- Public: plans + which checkout methods are live ----------------------

driverBilling.get('/plans', async (c) => {
  const db = c.env.DB;
  await ensureBillingTables(db);
  const { results } = await db
    .prepare('SELECT * FROM driver_subscription_plans WHERE active = 1 AND price_amount > 0 ORDER BY price_amount ASC')
    .all();
  let platformPct = Number(c.env.PLATFORM_COMMISSION_PCT ?? 0);
  const stored = await db.prepare("SELECT value FROM platform_settings WHERE key = 'commission_rate_pct'").first().catch(() => null);
  if (stored && Number.isFinite(Number(stored.value))) platformPct = Number(stored.value);
  return c.json({
    platformCommissionPct: platformPct,
    checkout: { stripe: !!c.env.STRIPE_SECRET_KEY, mpesa: mpesaEnabled(c.env) },
    plans: results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      priceAmount: r.price_amount,
      currency: r.currency,
      billingPeriod: r.billing_period,
      commissionRatePct: r.commission_rate_pct,
      perks: (() => {
        try {
          return JSON.parse(r.perks_json || '[]');
        } catch {
          return [];
        }
      })(),
    })),
  });
});

// ---- Driver: my subscription ---------------------------------------------

driverBilling.get('/me', requireAuth, async (c) => {
  const db = c.env.DB;
  await ensureBillingTables(db);
  const user = c.get('user');
  const sub = await db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.commission_rate_pct
       FROM driver_subscriptions s JOIN driver_subscription_plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active' AND (s.ended_at IS NULL OR s.ended_at > CURRENT_TIMESTAMP)
       ORDER BY s.ended_at IS NULL DESC, s.ended_at DESC LIMIT 1`
    )
    .bind(user.id)
    .first();
  const { results } = await db
    .prepare('SELECT * FROM subscription_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(user.id)
    .all();
  return c.json({
    subscription: sub
      ? { id: sub.id, planId: sub.plan_id, planName: sub.plan_name, commissionRatePct: sub.commission_rate_pct, startedAt: sub.started_at, endsAt: sub.ended_at }
      : null,
    payments: results.map(serializePayment),
  });
});

// ---- Stripe checkout -----------------------------------------------------

driverBilling.post('/checkout/stripe', requireAuth, async (c) => {
  const db = c.env.DB;
  const secretKey = c.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw BadRequest('Card payments are not configured on this server');
  await ensureBillingTables(db);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const plan = await getActivePlan(db, body.planId);

  const paymentId = await createSubscriptionPayment(db, { userId: user.id, plan, method: 'card_stripe' });
  let intent;
  try {
    intent = await createPaymentIntent({
      amount: plan.price_amount,
      currency: plan.currency,
      description: `Genesis ${plan.name}`,
      metadata: { subscriptionPaymentId: paymentId, planId: plan.id, userId: user.id },
      secretKey,
    });
  } catch (err) {
    await setPaymentStatus(db, paymentId, 'FAILED', null);
    throw BadRequest(err.message || 'Could not start the card payment');
  }
  await setPaymentStatus(db, paymentId, 'PENDING', intent.id);
  return c.json({ paymentId, clientSecret: intent.client_secret }, 201);
});

driverBilling.post('/checkout/stripe/:id/confirm', requireAuth, async (c) => {
  const db = c.env.DB;
  const secretKey = c.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw BadRequest('Card payments are not configured on this server');
  await ensureBillingTables(db);
  const payment = await getOwnPayment(db, c.req.param('id'), c.get('user').id);
  if (!payment.reference) throw BadRequest('This payment was never started with Stripe');

  const intent = await retrievePaymentIntent(payment.reference, { secretKey });
  if (intent.status === 'succeeded' && payment.status === 'PENDING') {
    await activateFromPayment(db, payment, { provider: 'stripe' });
  } else if (['canceled', 'requires_payment_method'].includes(intent.status) && payment.status === 'PENDING') {
    await setPaymentStatus(db, payment.id, 'FAILED', null);
  }
  const updated = await db.prepare('SELECT * FROM subscription_payments WHERE id = ?').bind(payment.id).first();
  return c.json({ payment: serializePayment(updated), stripeStatus: intent.status });
});

// ---- M-Pesa checkout -----------------------------------------------------

driverBilling.post('/checkout/mpesa', requireAuth, mpesaLimiter, async (c) => {
  const db = c.env.DB;
  if (!mpesaEnabled(c.env)) throw BadRequest('M-Pesa is not configured on this server');
  await ensureBillingTables(db);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (!body.phone) throw BadRequest('phone is required');
  const plan = await getActivePlan(db, body.planId);
  if (plan.currency !== 'KES') throw BadRequest('M-Pesa only supports plans priced in KES');

  const paymentId = await createSubscriptionPayment(db, { userId: user.id, plan, method: 'mpesa' });
  const origin = c.env.MPESA_CALLBACK_BASE_URL || new URL(c.req.url).origin;
  let stk;
  try {
    stk = await initiateStkPush({
      phone: body.phone,
      amount: plan.price_amount,
      accountReference: 'GenesisPro',
      transactionDesc: 'Genesis Pro',
      callbackUrl: `${origin}/api/pro/mpesa/callback?paymentId=${paymentId}`,
      config: mpesaConfigFromEnv(c.env),
    });
  } catch (err) {
    await setPaymentStatus(db, paymentId, 'FAILED', null);
    throw BadRequest(err.message || 'Could not start the M-Pesa payment');
  }
  await setPaymentStatus(db, paymentId, 'PENDING', stk.checkoutRequestId);
  return c.json({ paymentId, customerMessage: stk.customerMessage }, 201);
});

// Public — Safaricom calls this with no auth. Correlated by the paymentId
// in the URL and double-checked against the stored CheckoutRequestID, the
// same scheme as /api/payments/mpesa/callback. Always ACKs so Safaricom
// stops retrying.
driverBilling.post('/mpesa/callback', async (c) => {
  const db = c.env.DB;
  const ack = () => c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  const paymentId = c.req.query('paymentId');
  const body = await c.req.json().catch(() => ({}));
  const cb = body?.Body?.stkCallback;
  if (!paymentId || !cb) return ack();
  await ensureBillingTables(db);
  const payment = await db.prepare('SELECT * FROM subscription_payments WHERE id = ?').bind(paymentId).first();
  if (!payment || payment.reference !== cb.CheckoutRequestID || payment.status !== 'PENDING') return ack();
  if (cb.ResultCode === 0) {
    await activateFromPayment(db, payment, { provider: 'mpesa', ...parseCallbackMetadata(cb.CallbackMetadata?.Item) });
  } else {
    await setPaymentStatus(db, payment.id, 'FAILED', null);
  }
  return ack();
});

driverBilling.get('/checkout/mpesa/:id/status', requireAuth, async (c) => {
  const db = c.env.DB;
  await ensureBillingTables(db);
  let payment = await getOwnPayment(db, c.req.param('id'), c.get('user').id);
  if (payment.status === 'PENDING' && payment.reference && mpesaEnabled(c.env)) {
    const result = await queryStkPushStatus({ checkoutRequestId: payment.reference, config: mpesaConfigFromEnv(c.env) });
    if (!result.pending) {
      if (result.success) await activateFromPayment(db, payment, { provider: 'mpesa' });
      else await setPaymentStatus(db, payment.id, 'FAILED', null);
      payment = await db.prepare('SELECT * FROM subscription_payments WHERE id = ?').bind(payment.id).first();
    }
  }
  return c.json({ payment: serializePayment(payment) });
});

// ---- Admin: revenue summary ----------------------------------------------

export async function subscriptionRevenue(db) {
  await ensureBillingTables(db);
  const { results } = await db
    .prepare(
      `SELECT currency, COUNT(*) AS payments, SUM(amount) AS total,
              SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN amount ELSE 0 END) AS last30
       FROM subscription_payments WHERE status = 'CAPTURED' GROUP BY currency`
    )
    .all();
  return results;
}

// Total platform revenue: Pro subscriptions + ride commission. Commission
// columns are self-provisioned by payments.js, so tolerate their absence on
// a database that has never taken a payment.
export const revenueAdmin = new Hono();
revenueAdmin.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  const subscriptions = await subscriptionRevenue(db);
  let commission = [];
  try {
    ({ results: commission } = await db
      .prepare(
        `SELECT currency, COUNT(*) AS payments, SUM(amount) AS gross, SUM(commission_amount) AS total,
                SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN commission_amount ELSE 0 END) AS last30
         FROM payments WHERE status = 'CAPTURED' GROUP BY currency`
      )
      .all());
  } catch {
    commission = [];
  }
  const { n } = await db
    .prepare("SELECT COUNT(*) AS n FROM driver_subscriptions WHERE status = 'active' AND (ended_at IS NULL OR ended_at > CURRENT_TIMESTAMP)")
    .first();
  return c.json({ subscriptions, commission, activeSubscribers: Number(n) });
});
