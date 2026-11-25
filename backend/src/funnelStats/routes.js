import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { getFunnelStats } from '../tracking/funnelEvents.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

// Mirrors worker/src/routes/funnelStats.js — powers the UX Metrics admin
// screen's funnel visualisation with real counts from funnel_events.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    res.json({ windowDays: days, steps: getFunnelStats({ days }), generatedAt: new Date().toISOString() });
  })
);
