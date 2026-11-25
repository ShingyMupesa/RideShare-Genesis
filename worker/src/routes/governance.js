import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { Forbidden } from '../lib/errors.js';
import { listAuditEvents } from '../lib/audit.js';

export const governance = new Hono();

governance.get('/audit-events', requireAuth, async (c) => {
  const authUser = c.get('user');
  if (authUser.role !== 'admin') throw Forbidden('Admin access required');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const limit = c.req.query('limit');
  const events = await listAuditEvents(c.env.DB, { entityType, entityId, limit: limit ? Number(limit) : undefined });
  return c.json({ events });
});

// Sibling of the route above, for the System Logs admin screen — which
// holds only ADMIN_TOKEN (sessionStorage), never a user JWT, so it can
// never satisfy the requireAuth + role==='admin' gate above. Reuses the
// exact same listAuditEvents function; the JWT-gated route above is left
// untouched/unweakened.
governance.get('/audit-events-admin', requireAdmin, async (c) => {
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const limit = c.req.query('limit');
  const events = await listAuditEvents(c.env.DB, { entityType, entityId, limit: limit ? Number(limit) : undefined });
  return c.json({ events });
});
