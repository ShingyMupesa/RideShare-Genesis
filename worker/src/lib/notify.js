import { sendPushNotification } from './webpush.js';

// Self-provisions the same way feedback.js/tracking.js do for their own
// tables — no separate migration step needed against the existing
// production database.
let tableEnsured = false;
async function ensureTable(db) {
  if (tableEnsured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  tableEnsured = true;
}

function getVapidConfig(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKeyJwk: env.VAPID_PRIVATE_KEY_JWK, subject: env.VAPID_SUBJECT || 'mailto:mupesashingy@gmail.com' };
}

// Notifies every device a user has push-enabled. Deliberately sends an
// empty payload (see webpush.js for why) — every notification reads the
// same generic "something's new, open the app" text, defined once in the
// service worker, rather than per-event content. Never throws: a push
// failure, or push simply not being configured (no VAPID keys set), must
// never break the booking/message/match action that triggered it.
export async function notifyUser(db, env, userId) {
  const vapidConfig = getVapidConfig(env);
  if (!vapidConfig) return;

  await ensureTable(db);
  const { results } = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(userId).all();
  for (const sub of results) {
    const result = await sendPushNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, vapidConfig);
    if (result.expired) {
      await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
    }
  }
}

export { ensureTable as ensurePushTable, getVapidConfig };
