import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Conflict, Forbidden, NotFound } from '../utils/errors.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import * as DriverVerification from './repository.js';
import { storePhoto, readPhoto } from './docStorage.js';
import { notifyUser } from '../push/notify.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

function canViewSubmission(req, submission) {
  return req.user.role === 'admin' || req.user.id === submission.user_id;
}

// Public: the frontend needs to know whether enforcement is on before it
// decides whether to block an unverified driver from posting an offer.
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ enforced: DriverVerification.isEnforced() });
  })
);

router.post(
  '/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const { enforced } = req.body || {};
    if (typeof enforced !== 'boolean') throw BadRequest('enforced must be a boolean');
    DriverVerification.setEnforced(enforced);
    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'driver_verification.enforcement_toggled',
      entityType: 'platform_settings',
      entityId: 'driver_verification_enforced',
      metadata: { enforced },
    });
    res.json({ enforced });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = DriverVerification.getStatus(req.user.id);
    const submission = DriverVerification.getLatestSubmission(req.user.id);
    res.json({ status: status?.status || 'unverified', updatedAt: status?.updatedAt || null, submission: submission || null });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = DriverVerification.getStatus(req.user.id);
    if (current?.status === 'verified') throw Conflict('You are already a verified driver');
    if (current?.status === 'pending') throw Conflict('Your driver verification is already under review');

    const { fullLegalName, licenseNumber, licenseExpiry, vehicleMakeModel, vehiclePlate, licensePhoto, vehicleRegPhoto } = req.body || {};
    if (!fullLegalName?.trim()) throw BadRequest('fullLegalName is required');
    if (!licenseNumber?.trim()) throw BadRequest('licenseNumber is required');
    if (!vehiclePlate?.trim()) throw BadRequest('vehiclePlate is required');
    if (!licensePhoto) throw BadRequest('A photo of your driver\'s license is required');

    let storedLicensePhoto;
    let storedVehicleRegPhoto;
    try {
      storedLicensePhoto = storePhoto(licensePhoto, "License photo");
      if (vehicleRegPhoto) storedVehicleRegPhoto = storePhoto(vehicleRegPhoto, 'Vehicle registration photo');
    } catch (err) {
      throw BadRequest(err.message);
    }

    const submission = DriverVerification.submitVerification(req.user.id, {
      fullLegalName: fullLegalName.trim(),
      licenseNumber: licenseNumber.trim(),
      licenseExpiry: licenseExpiry || null,
      vehicleMakeModel: vehicleMakeModel?.trim() || null,
      vehiclePlate: vehiclePlate.trim(),
      licensePhoto: storedLicensePhoto,
      vehicleRegPhoto: storedVehicleRegPhoto,
    });

    recordAuditEvent({ actorId: req.user.id, eventType: 'driver_verification.submitted', entityType: 'driver_verification', entityId: submission.id });
    res.status(201).json({ submission });
  })
);

const PHOTO_FIELDS = {
  license: { key: 'license_photo_key', mime: 'license_photo_mime' },
  vehicleReg: { key: 'vehicle_reg_photo_key', mime: 'vehicle_reg_photo_mime' },
};

router.get(
  '/:id/photo/:which',
  requireAuth,
  asyncHandler(async (req, res) => {
    const submission = DriverVerification.getSubmissionById(req.params.id);
    if (!submission) throw NotFound('Submission not found');
    if (!canViewSubmission(req, submission)) throw Forbidden('You do not have access to this document');

    const fields = PHOTO_FIELDS[req.params.which];
    if (!fields) throw BadRequest('which must be "license" or "vehicleReg"');
    const key = submission[fields.key];
    if (!key) throw NotFound('No photo on file for this field');

    const bytes = readPhoto(key);
    if (!bytes) throw NotFound('Photo not found');
    res.setHeader('Content-Type', submission[fields.mime] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  })
);

router.get(
  '/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const status = req.query.status || 'pending';
    res.json({ submissions: DriverVerification.listQueue({ status }) });
  })
);

router.post(
  '/:id/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const submission = DriverVerification.getSubmissionById(req.params.id);
    if (!submission) throw NotFound('Submission not found');
    const updated = DriverVerification.reviewSubmission(req.params.id, {
      status: 'verified',
      reviewedBy: req.user.id,
      reviewNote: req.body?.reviewNote,
    });
    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'driver_verification.approved',
      entityType: 'driver_verification',
      entityId: submission.id,
      metadata: { userId: submission.user_id },
    });
    await notifyUser(submission.user_id);
    res.json({ submission: updated });
  })
);

router.post(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const submission = DriverVerification.getSubmissionById(req.params.id);
    if (!submission) throw NotFound('Submission not found');
    const { reviewNote } = req.body || {};
    if (!reviewNote?.trim()) throw BadRequest('reviewNote is required when rejecting a submission');
    const updated = DriverVerification.reviewSubmission(req.params.id, {
      status: 'rejected',
      reviewedBy: req.user.id,
      reviewNote: reviewNote.trim(),
    });
    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'driver_verification.rejected',
      entityType: 'driver_verification',
      entityId: submission.id,
      metadata: { userId: submission.user_id },
    });
    await notifyUser(submission.user_id);
    res.json({ submission: updated });
  })
);
