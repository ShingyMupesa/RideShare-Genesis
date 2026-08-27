import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { listAuditEvents } from './auditLog.js';

export const router = Router();

// Governance / audit trail — admin-only. Demonstrates the platform keeps a
// full, queryable record of sensitive actions for accountability.
router.get(
  '/audit-events',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    const { entityType, entityId, limit } = req.query;
    const events = listAuditEvents({ entityType, entityId, limit: limit ? Number(limit) : undefined });
    res.json({ events });
  })
);
