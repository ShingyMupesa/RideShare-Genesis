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
  const stmt =
    entityType && entityId
      ? db
          .prepare('SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?')
          .bind(entityType, entityId, limit)
      : db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?').bind(limit);

  const { results } = await stmt.all();
  return results.map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json) }));
}
