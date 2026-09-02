import { newId } from './ids.js';
import { extensionForMime, parseImageDataUrl } from './imageValidation.js';

// Cloudflare R2 isn't enabled on this account (a one-time dashboard
// opt-in), so document photos live in Workers KV (binding: DRIVER_DOCS,
// see wrangler.toml) instead — its 25 MiB per-value limit is far more than
// a compressed ID photo needs. Only an opaque key is ever stored in D1; if
// R2 is enabled later this file is the only thing that needs to change.

export async function storePhoto(env, dataUrl, fieldLabel) {
  const { mime, bytes } = parseImageDataUrl(dataUrl, fieldLabel);
  const key = `${newId('doc')}.${extensionForMime(mime)}`;
  await env.DRIVER_DOCS.put(key, bytes);
  return { key, mime };
}

// Returns an ArrayBuffer (or null), ready to hand straight to a Response.
export async function readPhoto(env, key) {
  return env.DRIVER_DOCS.get(key, 'arrayBuffer');
}
