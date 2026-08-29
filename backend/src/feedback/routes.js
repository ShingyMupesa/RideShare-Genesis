import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden } from '../utils/errors.js';
import * as Feedback from './repository.js';

export const router = Router();

// Public and unauthenticated by design — campaign traffic (a pitch reader,
// someone who just installed the PWA) needs to be able to leave feedback
// before ever creating an account. optionalAuth attaches the user id when
// a valid token happens to be present, but never requires one.
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { message, email, page } = req.body || {};
    const trimmed = (message || '').trim();
    if (!trimmed) throw BadRequest('message is required');
    if (trimmed.length > 4000) throw BadRequest('message is too long (max 4000 characters)');

    Feedback.createFeedback({
      message: trimmed,
      email: email ? String(email).trim().slice(0, 200) : null,
      page: page ? String(page).slice(0, 200) : null,
      userId: req.user?.id || null,
    });

    res.status(201).json({ ok: true });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    res.json({ feedback: Feedback.listFeedback() });
  })
);
