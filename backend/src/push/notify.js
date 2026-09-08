import { sendPushNotification } from './webpush.js';
import { getSubscriptionsForUser, removeSubscription } from './repository.js';

function getVapidConfig() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_JWK, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY_JWK) return null;
  return { publicKey: VAPID_PUBLIC_KEY, privateKeyJwk: VAPID_PRIVATE_KEY_JWK, subject: VAPID_SUBJECT || 'mailto:mupesashingy@gmail.com' };
}

// Notifies every device a user has push-enabled. Deliberately sends an
// empty payload (see webpush.js for why) — every notification reads the
// same generic "something's new, open the app" text, defined once in the
// service worker, rather than per-event content. Never throws: a push
// failure, or push simply not being configured (no VAPID keys set), must
// never break the booking/message/match action that triggered it.
export async function notifyUser(userId) {
  const vapidConfig = getVapidConfig();
  if (!vapidConfig) return;

  const subscriptions = getSubscriptionsForUser(userId);
  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      vapidConfig
    );
    if (result.expired) removeSubscription(sub.endpoint);
  }
}
