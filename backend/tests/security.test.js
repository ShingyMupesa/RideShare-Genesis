import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('security: no insecure defaults', () => {
  test('the server refuses to start without JWT_SECRET set', async () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // auth.js is a fresh module per unique query string, so this import
    // re-evaluates its top-level fail-fast check rather than hitting the
    // module cache from an earlier test file's import.
    await assert.rejects(
      () => import(`../src/middleware/auth.js?nocache=${Date.now()}`),
      /JWT_SECRET environment variable must be set/
    );

    if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
  });
});
