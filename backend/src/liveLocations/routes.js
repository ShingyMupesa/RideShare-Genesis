import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { listActiveLiveLocations } from './repository.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ active: listActiveLiveLocations(), generatedAt: new Date().toISOString() });
  })
);
