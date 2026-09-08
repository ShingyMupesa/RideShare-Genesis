import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';
import { deletePhoto } from '../driverVerification/docStorage.js';
import { removeSubscriptionsForUser } from '../push/repository.js';
import { recordAuditEvent } from '../governance/auditLog.js';

// Deleting an account never removes a user's row outright — journeys,
// bookings, payments, and messages other people rely on would either
// orphan or (with the FK's ON DELETE CASCADE) silently vanish out from
// under a counterparty who still has a valid claim on that history. So
// this anonymises the account in place instead: every field that
// identifies the person is wiped, everything that's someone else's
// legitimate record (a booking, a payment, a message thread) is left
// alone, just no longer attributable to a real name or contact detail.
export async function deleteAccount(userId) {
  // Every submission the user ever made, not just the latest — a
  // resubmission after rejection leaves the earlier row's photos in
  // storage too, and all of it goes.
  const submissions = db.prepare('SELECT * FROM driver_verifications WHERE user_id = ?').all(userId);
  for (const submission of submissions) {
    deletePhoto(submission.license_photo_key);
    deletePhoto(submission.vehicle_reg_photo_key);
    deletePhoto(submission.insurance_photo_key);
  }
  db.prepare('DELETE FROM driver_verifications WHERE user_id = ?').run(userId);

  removeSubscriptionsForUser(userId);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM deletion_requests WHERE user_id = ?').run(userId);

  db.prepare(
    `UPDATE journeys SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE owner_id = ? AND status NOT IN ('cancelled', 'completed')`
  ).run(userId);

  db.prepare(
    `UPDATE profiles SET
      bio = NULL, home_city = NULL, verified_id = 0, verified_email = 0,
      emergency_contact_name = NULL, emergency_contact_phone = NULL,
      driver_verification_status = 'unverified', driver_verification_updated_at = NULL,
      updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`
  ).run(userId);

  // A random bcrypt hash, not a plain unusable string — password_hash
  // still passes through bcrypt.compare() on any lingering login attempt
  // (e.g. a stale cached form), and a malformed hash there would throw
  // instead of just failing to match.
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  db.prepare(
    `UPDATE users SET
      email = ?, password_hash = ?, full_name = 'Deleted user', phone = NULL,
      status = 'deleted', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(`deleted-${userId}@ridesharegenesis.app`, unusablePassword, userId);

  recordAuditEvent({ actorId: userId, eventType: 'user.account_deleted', entityType: 'user', entityId: userId });
}

export function generateDeletionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeletionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createDeletionRequest(userId, tokenHash, expiresAt) {
  const id = newId('delreq');
  db.prepare(`INSERT INTO deletion_requests (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
    id,
    userId,
    tokenHash,
    expiresAt
  );
  return id;
}

export function findValidDeletionRequest(tokenHash) {
  return db
    .prepare(`SELECT * FROM deletion_requests WHERE token_hash = ? AND confirmed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`)
    .get(tokenHash);
}

export function markDeletionRequestConfirmed(id) {
  db.prepare(`UPDATE deletion_requests SET confirmed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}
