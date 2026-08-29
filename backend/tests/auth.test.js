import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('auth + profile', () => {
  let app;
  let cleanup;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
  });

  after(() => cleanup());

  test('registers a new user', async () => {
    const res = await request(app).post('/api/users/register').send({
      email: 'ada@example.com',
      password: 'supersecret1',
      fullName: 'Ada Lovelace',
      acceptedTerms: true,
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'ada@example.com');
    assert.ok(res.body.user.profile.decisionDna.weights.proximity);
  });

  test('rejects duplicate email', async () => {
    await request(app).post('/api/users/register').send({
      email: 'dup@example.com',
      password: 'supersecret1',
      fullName: 'Dup User',
      acceptedTerms: true,
    });
    const res = await request(app).post('/api/users/register').send({
      email: 'dup@example.com',
      password: 'supersecret1',
      fullName: 'Dup Again',
      acceptedTerms: true,
    });
    assert.equal(res.status, 409);
  });

  test('rejects weak password', async () => {
    const res = await request(app).post('/api/users/register').send({
      email: 'weak@example.com',
      password: '123',
      fullName: 'Weak Pw',
      acceptedTerms: true,
    });
    assert.equal(res.status, 400);
  });

  test('logs in and fetches /me', async () => {
    await request(app).post('/api/users/register').send({
      email: 'login@example.com',
      password: 'supersecret1',
      fullName: 'Login User',
      acceptedTerms: true,
    });
    const loginRes = await request(app).post('/api/users/login').send({
      email: 'login@example.com',
      password: 'supersecret1',
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token;

    const meRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.email, 'login@example.com');
  });

  test('rejects bad password on login', async () => {
    const res = await request(app).post('/api/users/login').send({
      email: 'login@example.com',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
  });

  test('updates profile preferences and Decision DNA weights', async () => {
    const reg = await request(app).post('/api/users/register').send({
      email: 'profile@example.com',
      password: 'supersecret1',
      fullName: 'Profile User',
      acceptedTerms: true,
    });
    const token = reg.body.token;

    const res = await request(app)
      .patch('/api/users/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bio: 'I love long drives',
        preferences: { chattiness: 'quiet' },
        decisionDnaWeights: { proximity: 0.6 },
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.profile.bio, 'I love long drives');
    assert.equal(res.body.user.profile.preferences.chattiness, 'quiet');
    assert.equal(res.body.user.profile.decisionDna.weights.proximity, 0.6);
  });

  test('requires auth for /me', async () => {
    const res = await request(app).get('/api/users/me');
    assert.equal(res.status, 401);
  });
});
