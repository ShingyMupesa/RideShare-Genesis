import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sendPushNotification } from '../src/push/webpush.js';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('web push VAPID signing', () => {
  test('produces a JWT whose signature verifies against the matching public key, targeting the endpoint\'s own origin', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const privateKeyJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey));
    const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const publicKey = bytesToBase64Url(publicKeyRaw);

    // A fake push endpoint — sendPushNotification will still attempt the
    // real fetch and get a network error, which is expected and fine here;
    // what matters is capturing the Authorization header it builds.
    let capturedAuth = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      capturedAuth = opts.headers.Authorization;
      return { ok: true, status: 201 };
    };

    try {
      await sendPushNotification(
        { endpoint: 'https://push.example.com/subscription/abc123', keys: { p256dh: 'x', auth: 'y' } },
        { privateKeyJwk, publicKey, subject: 'mailto:test@example.com' }
      );
    } finally {
      global.fetch = originalFetch;
    }

    assert.ok(capturedAuth, 'expected a captured Authorization header');
    const match = capturedAuth.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.ok(match, 'Authorization header should be in "vapid t=<jwt>, k=<key>" form');
    const [, jwt, k] = match;
    assert.equal(k, publicKey);

    const [encHeader, encPayload, encSig] = jwt.split('.');
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encHeader)));
    assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encPayload)));
    assert.equal(payload.aud, 'https://push.example.com');
    assert.equal(payload.sub, 'mailto:test@example.com');
    assert.ok(payload.exp > Math.floor(Date.now() / 1000), 'exp should be in the future');

    const signature = base64UrlToBytes(encSig);
    const signedData = new TextEncoder().encode(`${encHeader}.${encPayload}`);
    const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, signature, signedData);
    assert.equal(verified, true, 'signature must verify against the matching public key');
  });

  test('treats a 410 Gone response as an expired subscription to prune', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const privateKeyJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey));
    const publicKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));

    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 410 });
    let result;
    try {
      result = await sendPushNotification(
        { endpoint: 'https://push.example.com/subscription/gone', keys: { p256dh: 'x', auth: 'y' } },
        { privateKeyJwk, publicKey, subject: 'mailto:test@example.com' }
      );
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(result.expired, true);
    assert.equal(result.ok, false);
  });

  test('never throws even if the push service is unreachable', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const privateKeyJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey));
    const publicKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));

    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };
    let result;
    try {
      result = await sendPushNotification(
        { endpoint: 'https://push.example.com/subscription/unreachable', keys: { p256dh: 'x', auth: 'y' } },
        { privateKeyJwk, publicKey, subject: 'mailto:test@example.com' }
      );
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(result.ok, false);
    assert.equal(result.expired, false);
  });
});
