import { db } from '../db/connection.js';

// Generic key/value settings store backed by the `platform_settings` table.
// Unlike the worker side, this backend doesn't self-provision that table —
// it already exists via database/migrations/0008_driver_verification.sql
// (applied by runMigrations()), so there is no ensureTable() here, mirroring
// driverVerification/repository.js's isEnforced()/setEnforced() which read
// the same table the same way.
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, value);
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM platform_settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}
