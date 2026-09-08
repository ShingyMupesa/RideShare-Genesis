import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function createFeedback({ message, email, page, userId }) {
  const id = newId('fbk');
  db.prepare(
    `INSERT INTO feedback (id, message, email, page, user_id) VALUES (?, ?, ?, ?, ?)`
  ).run(id, message, email || null, page || null, userId || null);
  return id;
}

export function listFeedback(limit = 200) {
  return db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?`).all(limit);
}
