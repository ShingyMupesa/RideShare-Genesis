import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/errors.js';
import { FUNNEL_EVENT_TYPES, recordFunnelEvent } from './funnelEvents.js';

export const router = Router();

// Mirrors worker/src/routes/tracking.js's POST /funnel. A separate concern
// from any anonymous pitch-page analytics (which this backend doesn't have
// an equivalent of — see app.js) — these events are authenticated-context:
// optionalAuth attaches user_id whenever a session exists, null otherwise
// (e.g. "signup_started", fired before an account exists yet).
router.post(
  '/funnel',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { eventType, visitorId } = req.body || {};
    if (!FUNNEL_EVENT_TYPES.includes(eventType)) {
      return res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: `eventType must be one of: ${FUNNEL_EVENT_TYPES.join(', ')}` } });
    }
    recordFunnelEvent({ eventType, userId: req.user?.id || null, visitorId });
    res.status(201).json({ ok: true });
  })
);
