import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as Safety from './repository.js';
import { getProfile } from '../users/repository.js';
import { recordAuditEvent } from '../governance/auditLog.js';

export const router = Router();

const CATEGORIES = ['sos', 'incident_report', 'safety_concern', 'feedback'];

router.get('/trusted-contact', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  res.json({
    emergencyContactName: profile?.emergency_contact_name || null,
    emergencyContactPhone: profile?.emergency_contact_phone || null,
  });
});

// One-tap SOS: always logged as `critical` and audited immediately.
router.post(
  '/sos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, description } = req.body || {};
    const safetyCase = Safety.createSafetyCase({
      reporterId: req.user.id,
      bookingId,
      category: 'sos',
      severity: 'critical',
      description: description || 'SOS triggered from Safety Centre',
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'safety.sos_triggered',
      entityType: 'safety_case',
      entityId: safetyCase.id,
      metadata: { bookingId },
    });

    const profile = getProfile(req.user.id);
    res.status(201).json({
      safetyCase,
      guidance:
        'Genesis has logged this SOS and notified the Safety Centre. If you are in immediate danger, contact local emergency services now.',
      emergencyContact: {
        name: profile?.emergency_contact_name || null,
        phone: profile?.emergency_contact_phone || null,
      },
    });
  })
);

router.post(
  '/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, category, severity = 'medium', description } = req.body || {};
    if (!CATEGORIES.includes(category)) throw BadRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
    if (!description || !description.trim()) throw BadRequest('description is required');

    const safetyCase = Safety.createSafetyCase({
      reporterId: req.user.id,
      bookingId,
      category,
      severity,
      description: description.trim(),
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'safety.report_filed',
      entityType: 'safety_case',
      entityId: safetyCase.id,
      metadata: { category, severity },
    });

    res.status(201).json({ safetyCase });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ safetyCases: Safety.listSafetyCasesForUser(req.user.id) });
  })
);

router.post(
  '/:id/resolve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const safetyCase = Safety.getSafetyCaseById(req.params.id);
    if (!safetyCase) throw NotFound('Safety case not found');
    if (req.user.role !== 'admin' && safetyCase.reporter_id !== req.user.id) {
      throw Forbidden('Only the reporter or an admin can resolve this case');
    }
    const updated = Safety.updateSafetyCaseStatus(req.params.id, 'resolved');
    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'safety.case_resolved',
      entityType: 'safety_case',
      entityId: safetyCase.id,
    });
    res.json({ safetyCase: updated });
  })
);
