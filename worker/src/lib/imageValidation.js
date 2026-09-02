// Shared by backend and worker doc-storage modules (duplicated, not
// imported, the same way webpush.js is duplicated per-runtime — this file
// only uses plain Buffer/Uint8Array operations, no Node-only APIs, so it
// could move to a shared package later without changes).
//
// A driver could submit anything as "a photo of my license" — this at
// least confirms the bytes are a real image of a declared, allowed type
// before they're ever stored or shown to an admin, rather than trusting
// the client-supplied mime type on faith.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB decoded
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSION_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function extensionForMime(mime) {
  return EXTENSION_BY_MIME[mime] || 'bin';
}

// Parses a `data:<mime>;base64,<payload>` string into { mime, bytes }.
// Throws a plain Error with a human-readable message on any problem —
// callers wrap this in their own error type.
export function parseImageDataUrl(dataUrl, fieldLabel) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error(`${fieldLabel} must be a data URL (data:image/...;base64,...)`);
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error(`${fieldLabel} is not a valid base64 data URL`);
  const [, declaredMime, base64] = match;
  if (!ALLOWED_MIME_TYPES.includes(declaredMime)) {
    throw new Error(`${fieldLabel} must be a JPEG, PNG, or WEBP image`);
  }

  let bytes;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    throw new Error(`${fieldLabel} is not valid base64 data`);
  }
  if (bytes.length === 0) throw new Error(`${fieldLabel} is empty`);
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new Error(`${fieldLabel} is too large (max ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB)`);
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== declaredMime) {
    throw new Error(`${fieldLabel} does not look like a genuine ${declaredMime.replace('image/', '')} image`);
  }

  return { mime: declaredMime, bytes };
}

function base64ToBytes(base64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Magic-byte sniffing — cheap and reliable for the three formats a phone
// camera or a resizing canvas will actually produce.
function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
