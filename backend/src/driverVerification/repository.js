import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function getStatus(userId) {
  const row = db
    .prepare('SELECT driver_verification_status AS status, driver_verification_updated_at AS updatedAt FROM profiles WHERE user_id = ?')
    .get(userId);
  return row ? { status: row.status, updatedAt: row.updatedAt } : null;
}

export function getLatestSubmission(userId) {
  return db.prepare('SELECT * FROM driver_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
}

export function getSubmissionById(id) {
  return db.prepare('SELECT * FROM driver_verifications WHERE id = ?').get(id);
}

export function submitVerification(
  userId,
  { fullLegalName, licenseNumber, licenseExpiry, vehicleMakeModel, vehiclePlate, licensePhoto, vehicleRegPhoto }
) {
  const id = newId('drv');
  db.prepare(
    `INSERT INTO driver_verifications (
      id, user_id, full_legal_name, license_number, license_expiry, vehicle_make_model, vehicle_plate,
      license_photo_key, license_photo_mime, vehicle_reg_photo_key, vehicle_reg_photo_mime, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    id,
    userId,
    fullLegalName,
    licenseNumber,
    licenseExpiry || null,
    vehicleMakeModel || null,
    vehiclePlate,
    licensePhoto?.key || null,
    licensePhoto?.mime || null,
    vehicleRegPhoto?.key || null,
    vehicleRegPhoto?.mime || null
  );
  db.prepare(`UPDATE profiles SET driver_verification_status = 'pending', driver_verification_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(userId);
  return getSubmissionById(id);
}

export function listQueue({ status = 'pending' } = {}) {
  return db
    .prepare(
      `SELECT dv.*, u.full_name AS applicant_name, u.email AS applicant_email
       FROM driver_verifications dv JOIN users u ON u.id = dv.user_id
       WHERE dv.status = ? ORDER BY dv.submitted_at ASC`
    )
    .all(status);
}

export function reviewSubmission(id, { status, reviewedBy, reviewNote }) {
  const submission = getSubmissionById(id);
  if (!submission) return null;
  db.prepare(`UPDATE driver_verifications SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, review_note = ? WHERE id = ?`).run(
    status,
    reviewedBy || null,
    reviewNote || null,
    id
  );
  db.prepare(`UPDATE profiles SET driver_verification_status = ?, driver_verification_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(
    status,
    submission.user_id
  );
  return getSubmissionById(id);
}

// A single platform-wide toggle: absent (or '0') means enforcement is off —
// posting an offer never requires verification until an admin explicitly
// turns it on. Wrapped in try/catch because this table is self-provisioned
// on the worker side but not here; the migration guarantees it exists for
// the backend, so this is just defence against a stale local DB mid-upgrade.
export function isEnforced() {
  const row = db.prepare(`SELECT value FROM platform_settings WHERE key = 'driver_verification_enforced'`).get();
  return row?.value === '1';
}

export function setEnforced(enforced) {
  db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ('driver_verification_enforced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(enforced ? '1' : '0');
}
