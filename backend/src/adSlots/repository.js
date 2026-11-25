import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

// The `ad_slots` table is provisioned by
// database/migrations/0015_monetization_config.sql (applied by
// runMigrations()), consistent with this backend's convention of relying on
// real migrations rather than self-provisioning.

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    placement: row.placement,
    name: row.name,
    creativeUrl: row.creative_url,
    targetUrl: row.target_url,
    active: !!row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAdSlots() {
  return db.prepare('SELECT * FROM ad_slots ORDER BY created_at DESC').all().map(deserialize);
}

export function getAdSlotById(id) {
  return deserialize(db.prepare('SELECT * FROM ad_slots WHERE id = ?').get(id));
}

export function createAdSlot({ placement, name, creativeUrl, targetUrl, active, startsAt, endsAt }) {
  const id = newId('adSlot');
  db.prepare(
    `INSERT INTO ad_slots (id, placement, name, creative_url, target_url, active, starts_at, ends_at)
     VALUES (@id, @placement, @name, @creative_url, @target_url, @active, @starts_at, @ends_at)`
  ).run({
    id,
    placement,
    name,
    creative_url: creativeUrl || null,
    target_url: targetUrl || null,
    active: active ? 1 : 0,
    starts_at: startsAt || null,
    ends_at: endsAt || null,
  });
  return getAdSlotById(id);
}

export function updateAdSlot(id, { placement, name, creativeUrl, targetUrl, active, startsAt, endsAt }) {
  db.prepare(
    `UPDATE ad_slots
     SET placement = ?, name = ?, creative_url = ?, target_url = ?, active = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(placement, name, creativeUrl || null, targetUrl || null, active ? 1 : 0, startsAt || null, endsAt || null, id);
  return getAdSlotById(id);
}

// Soft-delete only — never hard-delete a slot.
export function deactivateAdSlot(id) {
  db.prepare('UPDATE ad_slots SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return getAdSlotById(id);
}
