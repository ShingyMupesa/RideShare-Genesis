import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../db/connection.js';
import { newId } from '../utils/ids.js';
import { extensionForMime, parseImageDataUrl } from './imageValidation.js';

const DOCS_DIR = path.join(dataDir, 'driver-docs');
fs.mkdirSync(DOCS_DIR, { recursive: true });

// Stores one photo, returning an opaque key (never a public URL — access
// is only ever through the authenticated GET route, gated to the
// submission's owner or an admin).
export function storePhoto(dataUrl, fieldLabel) {
  const { mime, bytes } = parseImageDataUrl(dataUrl, fieldLabel);
  const key = `${newId('doc')}.${extensionForMime(mime)}`;
  fs.writeFileSync(path.join(DOCS_DIR, key), bytes);
  return { key, mime };
}

export function readPhoto(key) {
  const filePath = path.join(DOCS_DIR, key);
  // Reject any key that could escape DOCS_DIR (defence in depth — keys are
  // always server-generated via newId(), never taken from client input,
  // but this makes that guarantee load-bearing rather than implicit).
  if (path.relative(DOCS_DIR, filePath).startsWith('..')) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}
