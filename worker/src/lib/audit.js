import { newId } from './ids.js';

export async function recordAuditEvent(db, { actorId = null, eventType, entityType, entityId, metadata = {} }) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, event_type, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(newId('audit'), actorId, eventType, entityType, entityId, JSON.stringify(metadata))
    .run();
}

export async function listAuditEvents(db, { entityType, entityId, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (entityType) {
    clauses.push('entity_type = ?');
    params.push(entityType);
  }
  if (entityId) {
    clauses.push('entity_id = ?');
    params.push(entityId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params, limit);

  const { results } = await stmt.all();
  return results.map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json) }));
}
