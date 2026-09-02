import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest } from '../utils/errors.js';
import { saveSubscription, removeSubscription } from './repository.js';

export const router = Router();

router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  res.json({ publicKey, enabled: !!publicKey });
});

router.post(
  '/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw BadRequest('endpoint and keys.p256dh/keys.auth are required');
    saveSubscription(req.user.id, { endpoint, keys });
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/unsubscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) throw BadRequest('endpoint is required');
    removeSubscription(endpoint);
    res.json({ ok: true });
  })
);
