// Generic key/value settings store backed by the `platform_settings` table.
// That table already exists in production — it was first provisioned by
// ensureDriverVerificationSchema() in driverVerification.js for its own
// single `driver_verification_enforced` key. This module is the one place
// that owns the CREATE TABLE statement for it now; driverVerification.js
// imports ensurePlatformSettingsTable() from here instead of creating the
// table inline, so there is only ever one source of truth for that SQL.
//
// Deliberately generic: this file knows nothing about any specific setting
// (commission rate, surge cap, driver-verification enforcement, ...) — it
// just stores and retrieves string values by key. Callers decide keys,
// allowed values, and env-var fallbacks.
let ensured = false;
export async function ensurePlatformSettingsTable(db) {
  if (ensured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  ensured = true;
}

export async function getSetting(db, key) {
  const row = await db.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

export async function setSetting(db, key, value) {
  await db
    .prepare(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(key, value)
    .run();
}

export async function getAllSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM platform_settings').all();
  const settings = {};
  for (const row of results) settings[row.key] = row.value;
  return settings;
}
