import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function createMessage({ bookingId, senderId, body }) {
  const id = newId('message');
  db.prepare(`INSERT INTO messages (id, booking_id, sender_id, body) VALUES (?, ?, ?, ?)`).run(
    id,
    bookingId,
    senderId,
    body
  );
  return getMessageById(id);
}

export function getMessageById(id) {
  return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id);
}

export function listMessagesForBooking(bookingId) {
  return db.prepare(`SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at ASC`).all(bookingId);
}
