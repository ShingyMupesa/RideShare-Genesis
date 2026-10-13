import crypto from 'node:crypto';

// The raw token goes in the emailed link; only its hash is ever stored, the
// same principle as never storing a plaintext password.
export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
