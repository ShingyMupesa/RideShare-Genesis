import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('account deletion', () => {
  let app;
  let cleanup;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
  });

  after(() => cleanup());

  async function registerUser(email) {
    const res = await request(app)
      .post('/api/users/register')
      .send({ email, password: 'CorrectHorse1', fullName: 'Test Rider', phone: '+254700000001', acceptedTerms: true });
    return res.body;
  }

  test('DELETE /me rejects the wrong password', async () => {
    const { token } = await registerUser('delete-wrong-pass@example.com');
    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: 'nope' });
    assert.equal(res.status, 401);
  });

  test('DELETE /me rejects a missing password', async () => {
    const { token } = await registerUser('delete-missing-pass@example.com');
    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({});
    assert.equal(res.status, 400);
  });

  test('DELETE /me anonymizes the account and the old email becomes usable again', async () => {
    const email = 'delete-me@example.com';
    const { token } = await registerUser(email);

    const del = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`).send({ password: 'CorrectHorse1' });
    assert.equal(del.status, 200);

    // The original credentials no longer work.
    const loginOld = await request(app).post('/api/users/login').send({ email, password: 'CorrectHorse1' });
    assert.equal(loginOld.status, 401);

    // The email is free again — nothing about the deleted account blocks reuse.
    const reRegister = await request(app)
      .post('/api/users/register')
      .send({ email, password: 'AnotherPass1', fullName: 'New Person', phone: '+254700000002', acceptedTerms: true });
    assert.equal(reRegister.status, 201);
  });

  test('POST /deletion-requests always returns the generic response, known email or not', async () => {
    await registerUser('deletion-request-flow@example.com');

    const unknown = await request(app).post('/api/users/deletion-requests').send({ email: 'nobody-here@example.com' });
    assert.equal(unknown.status, 200);

    const known = await request(app).post('/api/users/deletion-requests').send({ email: 'deletion-request-flow@example.com' });
    assert.equal(known.status, 200);
    assert.equal(known.body.message, unknown.body.message);
  });

  test('POST /deletion-requests/confirm rejects an invalid token', async () => {
    const res = await request(app).post('/api/users/deletion-requests/confirm').send({ token: 'not-a-real-token' });
    assert.equal(res.status, 400);
  });

  test('the web deletion flow anonymizes the account once confirmed', async () => {
    const email = 'web-deletion-flow@example.com';
    await registerUser(email);

    const { generateDeletionToken, hashDeletionToken, createDeletionRequest } = await import('../src/users/deletion.js');
    const { findUserByEmail } = await import('../src/users/repository.js');

    const user = findUserByEmail(email);
    const token = generateDeletionToken();
    const tokenHash = hashDeletionToken(token);
    createDeletionRequest(user.id, tokenHash, new Date(Date.now() + 30 * 60 * 1000).toISOString());

    const confirm = await request(app).post('/api/users/deletion-requests/confirm').send({ token });
    assert.equal(confirm.status, 200);

    const loginOld = await request(app).post('/api/users/login').send({ email, password: 'CorrectHorse1' });
    assert.equal(loginOld.status, 401);

    // Confirming the same token twice fails — it's single-use.
    const confirmAgain = await request(app).post('/api/users/deletion-requests/confirm').send({ token });
    assert.equal(confirmAgain.status, 400);
  });
});
