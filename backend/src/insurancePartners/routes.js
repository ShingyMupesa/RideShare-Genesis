import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import * as InsurancePartners from './repository.js';
import { recordAuditEvent } from '../governance/auditLog.js';

// Admin-manageable insurance-partner directory records. Config-only: there
// is no real insurance-partner API integration anywhere in this codebase,
// mirroring worker/src/routes/insurancePartners.js.

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ insurancePartners: InsurancePartners.listInsurancePartners() });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const { name, contactEmail, contactPhone, productDesc, referralUrl, active } = req.body || {};
    if (!name || !String(name).trim()) throw BadRequest('name is required');

    const insurancePartner = InsurancePartners.createInsurancePartner({
      name: String(name).trim(),
      contactEmail,
      contactPhone,
      productDesc,
      referralUrl,
      active,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'insurance_partner.created',
      entityType: 'insurance_partner',
      entityId: insurancePartner.id,
      metadata: { name: insurancePartner.name },
    });

    res.status(201).json({ insurancePartner });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = InsurancePartners.getInsurancePartnerById(req.params.id);
    if (!existing) throw NotFound('Insurance partner not found');

    const { name, contactEmail, contactPhone, productDesc, referralUrl, active } = req.body || {};
    const nextName = name !== undefined ? String(name).trim() : existing.name;
    if (!nextName) throw BadRequest('name is required');

    const insurancePartner = InsurancePartners.updateInsurancePartner(req.params.id, {
      name: nextName,
      contactEmail: contactEmail !== undefined ? contactEmail : existing.contactEmail,
      contactPhone: contactPhone !== undefined ? contactPhone : existing.contactPhone,
      productDesc: productDesc !== undefined ? productDesc : existing.productDesc,
      referralUrl: referralUrl !== undefined ? referralUrl : existing.referralUrl,
      active: active !== undefined ? !!active : existing.active,
    });

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'insurance_partner.updated',
      entityType: 'insurance_partner',
      entityId: insurancePartner.id,
      metadata: { name: insurancePartner.name },
    });

    res.json({ insurancePartner });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const existing = InsurancePartners.getInsurancePartnerById(req.params.id);
    if (!existing) throw NotFound('Insurance partner not found');

    const insurancePartner = InsurancePartners.deactivateInsurancePartner(req.params.id);

    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'insurance_partner.deactivated',
      entityType: 'insurance_partner',
      entityId: insurancePartner.id,
      metadata: { name: existing.name },
    });

    res.json({ insurancePartner });
  })
);
