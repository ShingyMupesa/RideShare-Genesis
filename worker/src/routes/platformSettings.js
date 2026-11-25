import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';
import { BadRequest } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';
import { ensurePlatformSettingsTable, getAllSettings, setSetting } from '../lib/platformSettings.js';

export const platformSettings = new Hono();

// The explicit allowlist of settings this endpoint knows how to read/write,
// each with an env-var (or hardcoded) fallback used whenever nothing has
// been explicitly stored in platform_settings yet — so nothing breaks or
// changes behavior just because this feature shipped.
const SETTINGS = {
  commission_rate_pct: { fallback: (env) => String(env.PLATFORM_COMMISSION_PCT ?? '0') },
  // No env var exists for this one yet — 1.5x is simply the default until
  // an admin sets it from the dashboard.
  surge_cap_multiplier: { fallback: () => '1.5' },
  min_fare_amount: { fallback: () => '0' },
  min_fare_currency: { fallback: () => '' },
  payout_threshold_amount: { fallback: () => '0' },
  payout_threshold_currency: { fallback: () => '' },
};

const ALLOWED_KEYS = Object.keys(SETTINGS);

platformSettings.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensurePlatformSettingsTable(db);
  const stored = await getAllSettings(db);

  const settings = {};
  for (const key of ALLOWED_KEYS) {
    const hasStored = Object.prototype.hasOwnProperty.call(stored, key);
    settings[key] = {
      value: hasStored ? stored[key] : SETTINGS[key].fallback(c.env),
      // true means nothing is stored in the DB for this key yet, so the UI
      // can show "using default" vs. "explicitly set".
      fromEnvFallback: !hasStored,
    };
  }
  return c.json({ settings });
});

platformSettings.post('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensurePlatformSettingsTable(db);

  const body = await c.req.json().catch(() => ({}));
  const { key, value } = body;
  if (!ALLOWED_KEYS.includes(key)) {
    throw BadRequest(`key must be one of: ${ALLOWED_KEYS.join(', ')}`);
  }
  if (value === undefined || value === null) throw BadRequest('value is required');

  const stringValue = String(value);
  await setSetting(db, key, stringValue);
  // actorId is null — admin-token auth (requireAdmin) carries no user
  // identity to attribute this to, same as the M-Pesa callback route's
  // audit events above.
  await recordAuditEvent(db, {
    actorId: null,
    eventType: 'platform_settings.updated',
    entityType: 'platform_settings',
    entityId: key,
    metadata: { key, value: stringValue },
  });
  return c.json({ key, value: stringValue });
});
