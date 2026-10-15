import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

// The `insurance_partners` table is provisioned by
// database/migrations/0015_monetization_config.sql (applied by
// runMigrations()), consistent with this backend's convention of relying on
// real migrations rather than self-provisioning.

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

export function listInsurancePartners() {
  return db.prepare('SELECT * FROM insurance_partners ORDER BY created_at DESC').all().map(deserialize);
}

export function getInsurancePartnerById(id) {
  return deserialize(db.prepare('SELECT * FROM insurance_partners WHERE id = ?').get(id));
}

export function createInsurancePartner({ name, contactEmail, contactPhone, productDesc, referralUrl, active }) {
  const id = newId('insurancePartner');
  db.prepare(
    `INSERT INTO insurance_partners (id, name, contact_email, contact_phone, product_desc, referral_url, active)
     VALUES (@id, @name, @contact_email, @contact_phone, @product_desc, @referral_url, @active)`
  ).run({
    id,
    name,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    product_desc: productDesc || null,
    referral_url: referralUrl || null,
    active: active ? 1 : 0,
  });
  return getInsurancePartnerById(id);
}

export function updateInsurancePartner(id, { name, contactEmail, contactPhone, productDesc, referralUrl, active }) {
  db.prepare(
    `UPDATE insurance_partners
     SET name = ?, contact_email = ?, contact_phone = ?, product_desc = ?, referral_url = ?, active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(name, contactEmail || null, contactPhone || null, productDesc || null, referralUrl || null, active ? 1 : 0, id);
  return getInsurancePartnerById(id);
}

// Soft-delete only — never hard-delete a partner.
export function deactivateInsurancePartner(id) {
  db.prepare('UPDATE insurance_partners SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return getInsurancePartnerById(id);
}
