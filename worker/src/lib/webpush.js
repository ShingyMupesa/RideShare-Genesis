// A from-scratch VAPID Web Push sender — no `web-push` npm package, because
// that package leans on Node's `crypto` module in ways that don't run
// unmodified on Cloudflare Workers. Everything here uses only the Web
// Crypto API (crypto.subtle) and btoa/TextEncoder, all of which are
// available as globals in both the Workers runtime and the Node backend —
// same "no SDK, works in both places" approach as the Stripe and Resend
// integrations elsewhere in this app.
//
// Deliberately sends an empty-payload push (no aes128gcm payload
// encryption, which Web Push requires for any actual data). The service
// worker shows a generic notification on `push`, and the app fetches real
// detail once it's opened — this keeps the crypto surface to "sign a VAPID
// JWT" rather than also implementing RFC 8291 payload encryption.

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(str) {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

async function importVapidPrivateKey(privateKeyJwkJson) {
  const jwk = JSON.parse(privateKeyJwkJson);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function buildVapidAuthHeader(endpoint, { privateKeyJwk, publicKey, subject }) {
  const origin = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    stringToBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) +
    '.' +
    stringToBase64Url(JSON.stringify({ aud: origin, exp: now + 12 * 3600, sub: subject }));

  const key = await importVapidPrivateKey(privateKeyJwk);
  // WebCrypto's ECDSA signature is raw (r || s), which is exactly the
  // format JWS ES256 expects — no DER re-encoding needed.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

/**
 * Sends a single push notification. Never throws — a push failure must
 * never break the booking/message/match flow that triggered it. Returns
 * { ok, expired } so the caller can prune subscriptions the push service
 * has permanently rejected (404/410 — the browser unsubscribed or the
 * subscription simply expired).
 */
export async function sendPushNotification(subscription, vapidConfig) {
  try {
    const authHeader = await buildVapidAuthHeader(subscription.endpoint, vapidConfig);
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: { Authorization: authHeader, TTL: '60', 'Content-Length': '0' },
    });
    if (res.status === 404 || res.status === 410) return { ok: false, expired: true };
    return { ok: res.ok, expired: false, status: res.status };
  } catch (err) {
    return { ok: false, expired: false, error: err.message };
  }
}
