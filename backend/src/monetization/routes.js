import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import { getUserById } from '../users/repository.js';
import * as Monetization from './repository.js';
import { recordAuditEvent } from '../governance/auditLog.js';

// Driver subscription plans + the (admin-assigned-only) subscriptions
// pointing at them. Config-only: there is no billing integration behind any
// of this yet, mirroring worker/src/routes/monetization.js.

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

const BILLING_PERIODS = ['monthly', 'weekly', 'yearly'];

function normalizePerks(perks) {
  if (perks === undefined || perks === null) return [];
  if (Array.isArray(perks)) return perks.map((p) => String(p));
  throw BadRequest('perks must be an array of strings');
}

// ---- Public: marketing-page list, active plans only -----------------------

export const publicRouter = Router();

publicRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    res.json({ plans: Monetization.listActivePlans() });
  })
);

// ---- Admin: subscription plan CRUD (soft-delete via active=0) ------------

export const plansRouter = Router();

plansRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ plans: Monetization.listPlans() });
  })
);

plansRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const { name, description, priceAmount, currency, billingPeriod, perks, active } = req.body || {};
    if (!name || !String(name).trim()) throw BadRequest('name is required');
    if (billingPeriod && !BILLING_PERIODS.includes(billingPeriod)) {
      throw BadRequest(`billingPeriod must be one of: ${BILLING_PERIODS.join(', ')}`);
    }
    const plan = Monetization.createPlan({
      name: String(name).trim(),
      description,
      priceAmount: priceAmount !== undefined && priceAmount !== null ? Number(priceAmount) : 0,
      currency,
      billingPeriod,
      perks: normalizePerks(perks),
      active,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'subscription_plan.created',
      entityType: 'subscription_plan',
      entityId: plan.id,
      metadata: { name: plan.name, priceAmount: plan.priceAmount, currency: plan.currency },
    });

    res.status(201).json({ plan });
  })
);

plansRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = Monetization.getPlanById(req.params.id);
    if (!existing) throw NotFound('Subscription plan not found');

    const { name, description, priceAmount, currency, billingPeriod, perks, active } = req.body || {};
    if (billingPeriod !== undefined && !BILLING_PERIODS.includes(billingPeriod)) {
      throw BadRequest(`billingPeriod must be one of: ${BILLING_PERIODS.join(', ')}`);
    }
    const nextName = name !== undefined ? String(name).trim() : existing.name;
    if (!nextName) throw BadRequest('name is required');

    const plan = Monetization.updatePlan(req.params.id, {
      name: nextName,
      description: description !== undefined ? description : existing.description,
      priceAmount: priceAmount !== undefined ? Number(priceAmount) : existing.priceAmount,
      currency: currency !== undefined ? currency : existing.currency,
      billingPeriod: billingPeriod !== undefined ? billingPeriod : existing.billingPeriod,
      perks: perks !== undefined ? normalizePerks(perks) : existing.perks,
      active: active !== undefined ? !!active : existing.active,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'subscription_plan.updated',
      entityType: 'subscription_plan',
      entityId: plan.id,
      metadata: { name: plan.name },
    });

    res.json({ plan });
  })
);

plansRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = Monetization.getPlanById(req.params.id);
    if (!existing) throw NotFound('Subscription plan not found');

    const plan = Monetization.deactivatePlan(req.params.id);

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'subscription_plan.deactivated',
      entityType: 'subscription_plan',
      entityId: plan.id,
      metadata: { name: existing.name },
    });

    res.json({ plan });
  })
);

// ---- Admin: who's assigned to what (read-only + manual assignment) -------

export const subscriptionsRouter = Router();

subscriptionsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ subscriptions: Monetization.listSubscriptions() });
  })
);

// Manual assignment only — there is no self-serve driver sign-up flow since
// there's no billing to drive one yet. An admin picks a user + plan here;
// nothing is charged.
subscriptionsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const { userId, planId } = req.body || {};
    if (!userId) throw BadRequest('userId is required');
    if (!planId) throw BadRequest('planId is required');

    if (!getUserById(userId)) throw NotFound('User not found');
    if (!Monetization.getPlanById(planId)) throw NotFound('Subscription plan not found');

    const subscription = Monetization.assignSubscription({ userId, planId });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'driver_subscription.assigned',
      entityType: 'driver_subscription',
      entityId: subscription.id,
      metadata: { userId, planId },
    });

    res.status(201).json({ subscription });
  })
);
