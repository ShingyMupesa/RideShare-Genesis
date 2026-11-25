import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';

// Admin-manageable ad slot records. Config-only: there is no real ad-serving
// anywhere in this codebase — nothing reads these rows to actually show an
// ad to anyone. `active` defaults to 0 (schema default) precisely because a
// slot being defined here never implies it is live.

export const adSlots = new Hono();

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so the CREATE TABLE has to stay on one line — see
// tracking.js/disputes.js for the same pattern. A real migration
// (worker/migrations/0016_monetization_config.sql) covers fresh
// environments; this is the safety net for an already-existing production DB.
async function ensureAdSlotsTable(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ad_slots (id TEXT PRIMARY KEY, placement TEXT NOT NULL, name TEXT NOT NULL, creative_url TEXT, target_url TEXT, active INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_ad_slots_placement ON ad_slots(placement)');
}

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

adSlots.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureAdSlotsTable(db);
  const { results } = await db.prepare('SELECT * FROM ad_slots ORDER BY created_at DESC').all();
  return c.json({ adSlots: results.map(deserialize) });
});

adSlots.post('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureAdSlotsTable(db);

  const body = await c.req.json().catch(() => ({}));
  const { placement, name, creativeUrl, targetUrl, active, startsAt, endsAt } = body;
  if (!placement || !String(placement).trim()) throw BadRequest('placement is required');
  if (!name || !String(name).trim()) throw BadRequest('name is required');

  const id = newId('adSlot');
  await db
    .prepare(
      `INSERT INTO ad_slots (id, placement, name, creative_url, target_url, active, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, String(placement).trim(), String(name).trim(), creativeUrl || null, targetUrl || null, active ? 1 : 0, startsAt || null, endsAt || null)
    .run();

  const adSlot = deserialize(await db.prepare('SELECT * FROM ad_slots WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'ad_slot.created',
    entityType: 'ad_slot',
    entityId: id,
    metadata: { placement: adSlot.placement, name: adSlot.name },
  });

  return c.json({ adSlot }, 201);
});

adSlots.put('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureAdSlotsTable(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM ad_slots WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Ad slot not found');

  const body = await c.req.json().catch(() => ({}));
  const { placement, name, creativeUrl, targetUrl, active, startsAt, endsAt } = body;

  const next = {
    placement: placement !== undefined ? String(placement).trim() : existing.placement,
    name: name !== undefined ? String(name).trim() : existing.name,
    creative_url: creativeUrl !== undefined ? creativeUrl : existing.creative_url,
    target_url: targetUrl !== undefined ? targetUrl : existing.target_url,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
    starts_at: startsAt !== undefined ? startsAt : existing.starts_at,
    ends_at: endsAt !== undefined ? endsAt : existing.ends_at,
  };
  if (!next.placement) throw BadRequest('placement is required');
  if (!next.name) throw BadRequest('name is required');

  await db
    .prepare(
      `UPDATE ad_slots
       SET placement = ?, name = ?, creative_url = ?, target_url = ?, active = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(next.placement, next.name, next.creative_url, next.target_url, next.active, next.starts_at, next.ends_at, id)
    .run();

  const adSlot = deserialize(await db.prepare('SELECT * FROM ad_slots WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'ad_slot.updated',
    entityType: 'ad_slot',
    entityId: id,
    metadata: { placement: adSlot.placement, name: adSlot.name },
  });

  return c.json({ adSlot });
});

adSlots.delete('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureAdSlotsTable(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM ad_slots WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Ad slot not found');

  // Soft-delete only, consistent with every other monetization entity.
  await db.prepare('UPDATE ad_slots SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  const adSlot = deserialize(await db.prepare('SELECT * FROM ad_slots WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'ad_slot.deactivated',
    entityType: 'ad_slot',
    entityId: id,
    metadata: { placement: existing.placement, name: existing.name },
  });

  return c.json({ adSlot });
});

export { ensureAdSlotsTable };
