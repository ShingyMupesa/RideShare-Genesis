import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { newId } from '../lib/ids.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';

export const safety = new Hono();

const CATEGORIES = ['sos', 'incident_report', 'safety_concern', 'feedback'];

async function createSafetyCase(db, { reporterId, bookingId, category, severity, description }) {
  const id = newId('safety');
  await db
    .prepare(
      `INSERT INTO safety_cases (id, reporter_id, booking_id, category, severity, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, reporterId, bookingId || null, category, severity, description || null)
    .run();
  return db.prepare('SELECT * FROM safety_cases WHERE id = ?').bind(id).first();
}

safety.get('/trusted-contact', requireAuth, async (c) => {
  const authUser = c.get('user');
  const profile = await c.env.DB.prepare('SELECT emergency_contact_name, emergency_contact_phone FROM profiles WHERE user_id = ?').bind(authUser.id).first();
  return c.json({
    emergencyContactName: profile?.emergency_contact_name || null,
    emergencyContactPhone: profile?.emergency_contact_phone || null,
  });
});

safety.post('/sos', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { bookingId, description } = body;

  const safetyCase = await createSafetyCase(db, {
    reporterId: authUser.id,
    bookingId,
    category: 'sos',
    severity: 'critical',
    description: description || 'SOS triggered from Safety Centre',
  });

  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'safety.sos_triggered', entityType: 'safety_case', entityId: safetyCase.id, metadata: { bookingId } });

  const profile = await db.prepare('SELECT emergency_contact_name, emergency_contact_phone FROM profiles WHERE user_id = ?').bind(authUser.id).first();
  return c.json(
    {
      safetyCase,
      guidance: 'Genesis has logged this SOS and notified the Safety Centre. If you are in immediate danger, contact local emergency services now.',
      emergencyContact: { name: profile?.emergency_contact_name || null, phone: profile?.emergency_contact_phone || null },
    },
    201
  );
});

safety.post('/report', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { bookingId, category, severity = 'medium', description } = body;
  if (!CATEGORIES.includes(category)) throw BadRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (!description || !description.trim()) throw BadRequest('description is required');

  const safetyCase = await createSafetyCase(db, { reporterId: authUser.id, bookingId, category, severity, description: description.trim() });
  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'safety.report_filed', entityType: 'safety_case', entityId: safetyCase.id, metadata: { category, severity } });
  return c.json({ safetyCase }, 201);
});

safety.get('/mine', requireAuth, async (c) => {
  const authUser = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT * FROM safety_cases WHERE reporter_id = ? ORDER BY created_at DESC').bind(authUser.id).all();
  return c.json({ safetyCases: results });
});

safety.post('/:id/resolve', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const safetyCase = await db.prepare('SELECT * FROM safety_cases WHERE id = ?').bind(c.req.param('id')).first();
  if (!safetyCase) throw NotFound('Safety case not found');
  if (authUser.role !== 'admin' && safetyCase.reporter_id !== authUser.id) {
    throw Forbidden('Only the reporter or an admin can resolve this case');
  }
  await db.prepare('UPDATE safety_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('resolved', safetyCase.id).run();
  await recordAuditEvent(db, { actorId: authUser.id, eventType: 'safety.case_resolved', entityType: 'safety_case', entityId: safetyCase.id });
  return c.json({ safetyCase: await db.prepare('SELECT * FROM safety_cases WHERE id = ?').bind(safetyCase.id).first() });
});
