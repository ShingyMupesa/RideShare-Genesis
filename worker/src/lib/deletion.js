import bcrypt from 'bcryptjs';
import { newId } from './ids.js';
import { deletePhoto } from './driverDocs.js';
import { recordAuditEvent } from './audit.js';

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateDeletionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashDeletionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

// deletion_requests predates this route on an existing production
// database; self-provision it the same way password_resets does in
// users.js, so this works without a separate `wrangler d1 migrations
// apply` step.
let deletionRequestsEnsured = false;
export async function ensureDeletionRequestsTable(db) {
  if (deletionRequestsEnsured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS deletion_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, confirmed_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  deletionRequestsEnsured = true;
}

export async function createDeletionRequest(db, userId, tokenHash, expiresAt) {
  const id = newId('delreq');
  await db.prepare('INSERT INTO deletion_requests (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, userId, tokenHash, expiresAt).run();
  return id;
}

export async function findValidDeletionRequest(db, tokenHash) {
  return db
    .prepare(`SELECT * FROM deletion_requests WHERE token_hash = ? AND confirmed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`)
    .bind(tokenHash)
    .first();
}

export async function markDeletionRequestConfirmed(db, id) {
  await db.prepare('UPDATE deletion_requests SET confirmed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
}

// Same anonymize-in-place strategy as the Node backend's version — see
// backend/src/users/deletion.js for the full reasoning. A journey,
// booking, payment, or message another user still relies on stays intact;
// only what identifies this account is wiped.
// Several of these tables are self-provisioned on first use, so on a given
// database some may not exist yet (production had no push_subscriptions or
// password_resets table, which made every account deletion fail). A missing
// table simply has nothing to delete; any other error still surfaces.
async function deleteUserRows(db, table, userId) {
  try {
    await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
  } catch (err) {
    if (!/no such table/i.test(err.message || '')) throw err;
  }
}

export async function deleteAccount(db, env, userId) {
  await ensureDeletionRequestsTable(db);

  let submissions = [];
  try {
    ({ results: submissions } = await db.prepare('SELECT * FROM driver_verifications WHERE user_id = ?').bind(userId).all());
  } catch (err) {
    if (!/no such table/i.test(err.message || '')) throw err;
  }
  for (const submission of submissions) {
    await deletePhoto(env, submission.license_photo_key);
    await deletePhoto(env, submission.vehicle_reg_photo_key);
    await deletePhoto(env, submission.insurance_photo_key);
  }
  // admin_members/admin_login_guard: a deleted account must lose any Admin
  // Team access or pending request along with it.
  for (const table of ['driver_verifications', 'push_subscriptions', 'password_resets', 'deletion_requests', 'admin_members', 'admin_login_guard']) {
    await deleteUserRows(db, table, userId);
  }

  await db
    .prepare(`UPDATE journeys SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND status NOT IN ('cancelled', 'completed')`)
    .bind(userId)
    .run();

  await db
    .prepare(
      `UPDATE profiles SET
        bio = NULL, home_city = NULL, verified_id = 0, verified_email = 0,
        emergency_contact_name = NULL, emergency_contact_phone = NULL,
        driver_verification_status = 'unverified', driver_verification_updated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    )
    .bind(userId)
    .run();

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const unusablePassword = await bcrypt.hash(toHex(randomBytes), 10);
  await db
    .prepare(
      `UPDATE users SET
        email = ?, password_hash = ?, full_name = 'Deleted user', phone = NULL,
        status = 'deleted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(`deleted-${userId}@ridesharegenesis.app`, unusablePassword, userId)
    .run();

  await recordAuditEvent(db, { actorId: userId, eventType: 'user.account_deleted', entityType: 'user', entityId: userId });
}
