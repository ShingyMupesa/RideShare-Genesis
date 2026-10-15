import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';

// Admin-manageable insurance-partner records. Config-only: there is no real
// insurance-partner API integration anywhere in this codebase — these rows
// are a contact/product directory an admin can curate, nothing more.
// `active` defaults to 0 (schema default) precisely because adding a
// partner here never implies it is referred to anyone yet.

export const insurancePartners = new Hono();

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so the CREATE TABLE has to stay on one line — see
// tracking.js/disputes.js for the same pattern. A real migration
// (worker/migrations/0016_monetization_config.sql) covers fresh
// environments; this is the safety net for an already-existing production DB.
async function ensureInsurancePartnersTable(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS insurance_partners (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_email TEXT, contact_phone TEXT, product_desc TEXT, referral_url TEXT, active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
}

function deserialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    productDesc: row.product_desc,
    referralUrl: row.referral_url,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

insurancePartners.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureInsurancePartnersTable(db);
  const { results } = await db.prepare('SELECT * FROM insurance_partners ORDER BY created_at DESC').all();
  return c.json({ insurancePartners: results.map(deserialize) });
});

insurancePartners.post('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureInsurancePartnersTable(db);

  const body = await c.req.json().catch(() => ({}));
  const { name, contactEmail, contactPhone, productDesc, referralUrl, active } = body;
  if (!name || !String(name).trim()) throw BadRequest('name is required');

  const id = newId('insurancePartner');
  await db
    .prepare(
      `INSERT INTO insurance_partners (id, name, contact_email, contact_phone, product_desc, referral_url, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, String(name).trim(), contactEmail || null, contactPhone || null, productDesc || null, referralUrl || null, active ? 1 : 0)
    .run();

  const insurancePartner = deserialize(await db.prepare('SELECT * FROM insurance_partners WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'insurance_partner.created',
    entityType: 'insurance_partner',
    entityId: id,
    metadata: { name: insurancePartner.name },
  });

  return c.json({ insurancePartner }, 201);
});

insurancePartners.put('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureInsurancePartnersTable(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM insurance_partners WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Insurance partner not found');

  const body = await c.req.json().catch(() => ({}));
  const { name, contactEmail, contactPhone, productDesc, referralUrl, active } = body;

  const next = {
    name: name !== undefined ? String(name).trim() : existing.name,
    contact_email: contactEmail !== undefined ? contactEmail : existing.contact_email,
    contact_phone: contactPhone !== undefined ? contactPhone : existing.contact_phone,
    product_desc: productDesc !== undefined ? productDesc : existing.product_desc,
    referral_url: referralUrl !== undefined ? referralUrl : existing.referral_url,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
  };
  if (!next.name) throw BadRequest('name is required');

  await db
    .prepare(
      `UPDATE insurance_partners
       SET name = ?, contact_email = ?, contact_phone = ?, product_desc = ?, referral_url = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(next.name, next.contact_email, next.contact_phone, next.product_desc, next.referral_url, next.active, id)
    .run();

  const insurancePartner = deserialize(await db.prepare('SELECT * FROM insurance_partners WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'insurance_partner.updated',
    entityType: 'insurance_partner',
    entityId: id,
    metadata: { name: insurancePartner.name },
  });

  return c.json({ insurancePartner });
});

insurancePartners.delete('/:id', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureInsurancePartnersTable(db);

  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM insurance_partners WHERE id = ?').bind(id).first();
  if (!existing) throw NotFound('Insurance partner not found');

  // Soft-delete only, consistent with every other monetization entity.
  await db.prepare('UPDATE insurance_partners SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  const insurancePartner = deserialize(await db.prepare('SELECT * FROM insurance_partners WHERE id = ?').bind(id).first());

  await recordAuditEvent(db, {
    eventType: 'insurance_partner.deactivated',
    entityType: 'insurance_partner',
    entityId: id,
    metadata: { name: existing.name },
  });

  return c.json({ insurancePartner });
});

export { ensureInsurancePartnersTable };
