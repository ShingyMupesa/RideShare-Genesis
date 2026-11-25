import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Forbidden } from '../utils/errors.js';
import { listAuditEvents, recordAuditEvent } from './auditLog.js';
import { getAllSettings, setSetting } from './platformSettings.js';

export const router = Router();

// The explicit allowlist of settings these endpoints know how to read/write,
// each with an env-var (or hardcoded) fallback used whenever nothing has
// been explicitly stored in platform_settings yet — mirrors
// worker/src/routes/platformSettings.js's SETTINGS map exactly.
const PLATFORM_SETTINGS = {
  commission_rate_pct: { fallback: () => String(process.env.PLATFORM_COMMISSION_PCT ?? '0') },
  // No env var exists for this one yet — 1.5x is simply the default until
  // an admin sets it from the dashboard.
  surge_cap_multiplier: { fallback: () => '1.5' },
  min_fare_amount: { fallback: () => '0' },
  min_fare_currency: { fallback: () => '' },
  payout_threshold_amount: { fallback: () => '0' },
  payout_threshold_currency: { fallback: () => '' },
};
const PLATFORM_SETTINGS_KEYS = Object.keys(PLATFORM_SETTINGS);

// Governance / audit trail — admin-only. Demonstrates the platform keeps a
// full, queryable record of sensitive actions for accountability.
router.get(
  '/audit-events',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    const { entityType, entityId, limit } = req.query;
    const events = listAuditEvents({ entityType, entityId, limit: limit ? Number(limit) : undefined });
    res.json({ events });
  })
);

// Sibling of the route above — mirrors worker/src/routes/governance.js's
// GET /audit-events-admin (there, a second gate for the ADMIN_TOKEN-only
// admin HTML panel). This backend has no ADMIN_TOKEN concept, so it reuses
// the same JWT role==='admin' gate as /audit-events above; kept as its own
// route rather than folded into it, for parity with the worker's route
// shape and so the admin-list-endpoint test coverage has a stable target.
router.get(
  '/audit-events-admin',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    const { entityType, entityId, limit } = req.query;
    const events = listAuditEvents({ entityType, entityId, limit: limit ? Number(limit) : undefined });
    res.json({ events });
  })
);

// Admin-configurable platform settings (commission rate, surge cap, min
// fare, payout threshold) — mirrors worker/src/routes/platformSettings.js's
// two endpoints, using this backend's own requireAuth + role==='admin' gate
// (assertAdmin pattern from driverVerification/routes.js) in place of the
// worker's shared-secret ADMIN_TOKEN, since this backend has real per-user
// identity via JWT.
router.get(
  '/platform-settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    const stored = getAllSettings();
    const settings = {};
    for (const key of PLATFORM_SETTINGS_KEYS) {
      const hasStored = Object.prototype.hasOwnProperty.call(stored, key);
      settings[key] = {
        value: hasStored ? stored[key] : PLATFORM_SETTINGS[key].fallback(),
        // true means nothing is stored in the DB for this key yet, so the
        // UI can show "using default" vs. "explicitly set".
        fromEnvFallback: !hasStored,
      };
    }
    res.json({ settings });
  })
);

router.post(
  '/platform-settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw Forbidden('Admin access required');
    const { key, value } = req.body || {};
    if (!PLATFORM_SETTINGS_KEYS.includes(key)) {
      throw BadRequest(`key must be one of: ${PLATFORM_SETTINGS_KEYS.join(', ')}`);
    }
    if (value === undefined || value === null) throw BadRequest('value is required');

    const stringValue = String(value);
    setSetting(key, stringValue);
    // Unlike the worker's admin-token gate, this route has a real user
    // identity from the JWT, so it's attributed instead of left null.
    recordAuditEvent({
      actorId: req.user.id,
      eventType: 'platform_settings.updated',
      entityType: 'platform_settings',
      entityId: key,
      metadata: { key, value: stringValue },
    });
    res.json({ key, value: stringValue });
  })
);
