import { newId } from './ids.js';

// Self-provisions the same way notify.js/users.js do for their own
// tables/columns — no separate `wrangler d1 migrations apply` step needed
// against the existing production database. D1/SQLite has no `ADD COLUMN
// IF NOT EXISTS`, so a second call's "duplicate column" error is swallowed.
let ensured = false;
export async function ensureDriverVerificationSchema(db) {
  if (ensured) return;
  try {
    await db.exec("ALTER TABLE profiles ADD COLUMN driver_verification_status TEXT NOT NULL DEFAULT 'unverified'");
  } catch (err) {
    if (!/duplicate column/i.test(err.message || '')) throw err;
  }
  try {
    await db.exec('ALTER TABLE profiles ADD COLUMN driver_verification_updated_at TEXT');
  } catch (err) {
    if (!/duplicate column/i.test(err.message || '')) throw err;
  }
  await db.exec(
    `CREATE TABLE IF NOT EXISTS driver_verifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, full_legal_name TEXT NOT NULL, license_number TEXT NOT NULL, license_expiry TEXT, vehicle_make_model TEXT, vehicle_plate TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), reviewed_at TEXT, reviewed_by TEXT, review_note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec(`CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`);
  for (const column of ['license_photo_key TEXT', 'license_photo_mime TEXT', 'vehicle_reg_photo_key TEXT', 'vehicle_reg_photo_mime TEXT']) {
    try {
      await db.exec(`ALTER TABLE driver_verifications ADD COLUMN ${column}`);
    } catch (err) {
      if (!/duplicate column/i.test(err.message || '')) throw err;
    }
  }
  ensured = true;
}

export async function getStatus(db, userId) {
  const row = await db
    .prepare('SELECT driver_verification_status AS status, driver_verification_updated_at AS updatedAt FROM profiles WHERE user_id = ?')
    .bind(userId)
    .first();
  return row ? { status: row.status, updatedAt: row.updatedAt } : null;
}

export async function getLatestSubmission(db, userId) {
  return db.prepare('SELECT * FROM driver_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first();
}

export async function getSubmissionById(db, id) {
  return db.prepare('SELECT * FROM driver_verifications WHERE id = ?').bind(id).first();
}

export async function submitVerification(
  db,
  userId,
  { fullLegalName, licenseNumber, licenseExpiry, vehicleMakeModel, vehiclePlate, licensePhoto, vehicleRegPhoto }
) {
  const id = newId('drv');
  await db
    .prepare(
      `INSERT INTO driver_verifications (
        id, user_id, full_legal_name, license_number, license_expiry, vehicle_make_model, vehicle_plate,
        license_photo_key, license_photo_mime, vehicle_reg_photo_key, vehicle_reg_photo_mime, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
    .bind(
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
    )
    .run();
  await db
    .prepare(`UPDATE profiles SET driver_verification_status = 'pending', driver_verification_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
    .bind(userId)
    .run();
  return getSubmissionById(db, id);
}

export async function listQueue(db, { status = 'pending' } = {}) {
  const { results } = await db
    .prepare(
      `SELECT dv.*, u.full_name AS applicant_name, u.email AS applicant_email
       FROM driver_verifications dv JOIN users u ON u.id = dv.user_id
       WHERE dv.status = ? ORDER BY dv.submitted_at ASC`
    )
    .bind(status)
    .all();
  return results;
}

export async function reviewSubmission(db, id, { status, reviewedBy, reviewNote }) {
  const submission = await getSubmissionById(db, id);
  if (!submission) return null;
  await db
    .prepare(`UPDATE driver_verifications SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, review_note = ? WHERE id = ?`)
    .bind(status, reviewedBy || null, reviewNote || null, id)
    .run();
  await db
    .prepare(`UPDATE profiles SET driver_verification_status = ?, driver_verification_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
    .bind(status, submission.user_id)
    .run();
  return getSubmissionById(db, id);
}

// A single platform-wide toggle: absent (or '0') means enforcement is off
// — posting an offer never requires verification until an admin explicitly
// turns it on from the dashboard.
export async function isEnforced(db) {
  const row = await db.prepare(`SELECT value FROM platform_settings WHERE key = 'driver_verification_enforced'`).first();
  return row?.value === '1';
}

export async function setEnforced(db, enforced) {
  await db
    .prepare(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('driver_verification_enforced', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(enforced ? '1' : '0')
    .run();
}
