import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

/**
 * Records an immutable governance event. Every sensitive state transition
 * (booking status change, payment capture, safety report, etc.) is logged
 * here so the platform has a full, queryable audit trail.
 *
 * The insert statement is prepared lazily (not at module load time) because
 * this module is imported before migrations run, and `audit_events` won't
 * exist yet at import time.
 */
export function recordAuditEvent({ actorId = null, eventType, entityType, entityId, metadata = {} }) {
  db.prepare(
    `INSERT INTO audit_events (id, actor_id, event_type, entity_type, entity_id, metadata_json)
     VALUES (@id, @actor_id, @event_type, @entity_type, @entity_id, @metadata_json)`
  ).run({
    id: newId('audit'),
    actor_id: actorId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: JSON.stringify(metadata),
  });
}

export function listAuditEvents({ entityType, entityId, limit = 100 } = {}) {
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
  return db
    .prepare(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit)
    .map(deserialize);
}

function deserialize(row) {
  return { ...row, metadata: JSON.parse(row.metadata_json) };
}
