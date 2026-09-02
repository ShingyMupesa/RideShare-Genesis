import { db } from '../db/connection.js';
import { newId } from '../utils/ids.js';

export function saveSubscription(userId, { endpoint, keys }) {
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (@id, @user_id, @endpoint, @p256dh, @auth)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run({ id: newId('push'), user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth });
}

export function removeSubscription(endpoint) {
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function getSubscriptionsForUser(userId) {
  return db.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`).all(userId);
}
