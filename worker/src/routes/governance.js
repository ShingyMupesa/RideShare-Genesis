import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
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
