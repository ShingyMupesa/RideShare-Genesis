import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function createSafetyCase({ reporterId, bookingId, category, severity, description }) {
  const id = newId('safety');
  db.prepare(
    `INSERT INTO safety_cases (id, reporter_id, booking_id, category, severity, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, reporterId, bookingId || null, category, severity, description || null);
  return getSafetyCaseById(id);
}

export function getSafetyCaseById(id) {
  return db.prepare(`SELECT * FROM safety_cases WHERE id = ?`).get(id);
}

export function listSafetyCasesForUser(userId) {
  return db.prepare(`SELECT * FROM safety_cases WHERE reporter_id = ? ORDER BY created_at DESC`).all(userId);
}

export function updateSafetyCaseStatus(id, status) {
  db.prepare(`UPDATE safety_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);
  return getSafetyCaseById(id);
}
