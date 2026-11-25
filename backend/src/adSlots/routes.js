import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as AdSlots from './repository.js';
import { recordAuditEvent } from '../governance/auditLog.js';

// Admin-manageable ad slot records. Config-only: there is no real ad-serving
// anywhere in this codebase, mirroring worker/src/routes/adSlots.js.

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ adSlots: AdSlots.listAdSlots() });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const { placement, name, creativeUrl, targetUrl, active, startsAt, endsAt } = req.body || {};
    if (!placement || !String(placement).trim()) throw BadRequest('placement is required');
    if (!name || !String(name).trim()) throw BadRequest('name is required');

    const adSlot = AdSlots.createAdSlot({
      placement: String(placement).trim(),
      name: String(name).trim(),
      creativeUrl,
      targetUrl,
      active,
      startsAt,
      endsAt,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'ad_slot.created',
      entityType: 'ad_slot',
      entityId: adSlot.id,
      metadata: { placement: adSlot.placement, name: adSlot.name },
    });

    res.status(201).json({ adSlot });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = AdSlots.getAdSlotById(req.params.id);
    if (!existing) throw NotFound('Ad slot not found');

    const { placement, name, creativeUrl, targetUrl, active, startsAt, endsAt } = req.body || {};
    const nextPlacement = placement !== undefined ? String(placement).trim() : existing.placement;
    const nextName = name !== undefined ? String(name).trim() : existing.name;
    if (!nextPlacement) throw BadRequest('placement is required');
    if (!nextName) throw BadRequest('name is required');

    const adSlot = AdSlots.updateAdSlot(req.params.id, {
      placement: nextPlacement,
      name: nextName,
      creativeUrl: creativeUrl !== undefined ? creativeUrl : existing.creativeUrl,
      targetUrl: targetUrl !== undefined ? targetUrl : existing.targetUrl,
      active: active !== undefined ? !!active : existing.active,
      startsAt: startsAt !== undefined ? startsAt : existing.startsAt,
      endsAt: endsAt !== undefined ? endsAt : existing.endsAt,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'ad_slot.updated',
      entityType: 'ad_slot',
      entityId: adSlot.id,
      metadata: { placement: adSlot.placement, name: adSlot.name },
    });

    res.json({ adSlot });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = AdSlots.getAdSlotById(req.params.id);
    if (!existing) throw NotFound('Ad slot not found');

    const adSlot = AdSlots.deactivateAdSlot(req.params.id);

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'ad_slot.deactivated',
      entityType: 'ad_slot',
      entityId: adSlot.id,
      metadata: { placement: existing.placement, name: existing.name },
    });

    res.json({ adSlot });
  })
);
