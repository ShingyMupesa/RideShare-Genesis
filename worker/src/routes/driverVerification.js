import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';
import { notifyUser } from '../lib/notify.js';
import * as DriverVerification from '../lib/driverVerification.js';

export const driverVerification = new Hono();

// Public: the frontend needs to know whether enforcement is on before it
// decides whether to block an unverified driver from posting an offer.
driverVerification.get('/settings', async (c) => {
  const db = c.env.DB;
  await DriverVerification.ensureDriverVerificationSchema(db);
  return c.json({ enforced: await DriverVerification.isEnforced(db) });
});

// Admin actions below use the same shared-secret ADMIN_TOKEN gate as the
// rest of the /admin dashboard (tracking.js /stats, feedback.js /list) —
// there's no per-admin login on that dashboard, so "who reviewed this" is
// captured as a free-text reviewer name typed into the form instead of a
// JWT identity.
driverVerification.post('/settings', requireAdmin, async (c) => {
  const db = c.env.DB;
  await DriverVerification.ensureDriverVerificationSchema(db);

  const body = await c.req.json().catch(() => ({}));
  if (typeof body.enforced !== 'boolean') throw BadRequest('enforced must be a boolean');
  await DriverVerification.setEnforced(db, body.enforced);
  await recordAuditEvent(db, {
    eventType: 'driver_verification.enforcement_toggled',
    entityType: 'platform_settings',
    entityId: 'driver_verification_enforced',
    metadata: { enforced: body.enforced },
  });
  return c.json({ enforced: body.enforced });
});

driverVerification.get('/me', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  await DriverVerification.ensureDriverVerificationSchema(db);
  const status = await DriverVerification.getStatus(db, authUser.id);
  const submission = await DriverVerification.getLatestSubmission(db, authUser.id);
  return c.json({ status: status?.status || 'unverified', updatedAt: status?.updatedAt || null, submission: submission || null });
});

driverVerification.post('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  await DriverVerification.ensureDriverVerificationSchema(db);

  const current = await DriverVerification.getStatus(db, authUser.id);
  if (current?.status === 'verified') throw Conflict('You are already a verified driver');
  if (current?.status === 'pending') throw Conflict('Your driver verification is already under review');

  const body = await c.req.json().catch(() => ({}));
  const { fullLegalName, licenseNumber, licenseExpiry, vehicleMakeModel, vehiclePlate } = body;
  if (!fullLegalName?.trim()) throw BadRequest('fullLegalName is required');
  if (!licenseNumber?.trim()) throw BadRequest('licenseNumber is required');
  if (!vehiclePlate?.trim()) throw BadRequest('vehiclePlate is required');

  const submission = await DriverVerification.submitVerification(db, authUser.id, {
    fullLegalName: fullLegalName.trim(),
    licenseNumber: licenseNumber.trim(),
    licenseExpiry: licenseExpiry || null,
    vehicleMakeModel: vehicleMakeModel?.trim() || null,
    vehiclePlate: vehiclePlate.trim(),
  });

  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'driver_verification.submitted', entityType: 'driver_verification', entityId: submission.id });
  return c.json({ submission }, 201);
});

driverVerification.get('/queue', requireAdmin, async (c) => {
  const db = c.env.DB;
  await DriverVerification.ensureDriverVerificationSchema(db);
  const status = c.req.query('status') || 'pending';
  return c.json({ submissions: await DriverVerification.listQueue(db, { status }) });
});

driverVerification.post('/:id/approve', requireAdmin, async (c) => {
  const db = c.env.DB;
  await DriverVerification.ensureDriverVerificationSchema(db);

  const submission = await DriverVerification.getSubmissionById(db, c.req.param('id'));
  if (!submission) throw NotFound('Submission not found');
  const body = await c.req.json().catch(() => ({}));
  const updated = await DriverVerification.reviewSubmission(db, c.req.param('id'), {
    status: 'verified',
    reviewedBy: body.reviewerName?.trim() || 'admin',
    reviewNote: body.reviewNote,
  });
  await recordAuditEvent(db, {
    eventType: 'driver_verification.approved',
    entityType: 'driver_verification',
    entityId: submission.id,
    metadata: { userId: submission.user_id, reviewedBy: body.reviewerName?.trim() || 'admin' },
  });
  await notifyUser(db, c.env, submission.user_id);
  return c.json({ submission: updated });
});

driverVerification.post('/:id/reject', requireAdmin, async (c) => {
  const db = c.env.DB;
  await DriverVerification.ensureDriverVerificationSchema(db);

  const submission = await DriverVerification.getSubmissionById(db, c.req.param('id'));
  if (!submission) throw NotFound('Submission not found');
  const body = await c.req.json().catch(() => ({}));
  if (!body.reviewNote?.trim()) throw BadRequest('reviewNote is required when rejecting a submission');
  const updated = await DriverVerification.reviewSubmission(db, c.req.param('id'), {
    status: 'rejected',
    reviewedBy: body.reviewerName?.trim() || 'admin',
    reviewNote: body.reviewNote.trim(),
  });
  await recordAuditEvent(db, {
    eventType: 'driver_verification.rejected',
    entityType: 'driver_verification',
    entityId: submission.id,
    metadata: { userId: submission.user_id, reviewedBy: body.reviewerName?.trim() || 'admin' },
  });
  await notifyUser(db, c.env, submission.user_id);
  return c.json({ submission: updated });
});
