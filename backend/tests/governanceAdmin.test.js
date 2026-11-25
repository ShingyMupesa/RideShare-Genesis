import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('GET /api/governance/audit-events-admin (Phase 7)', () => {
  let app;
  let cleanup;
  let adminToken;
  let riderToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const rider = await request(app).post('/api/users/register').send({
      email: 'gov-rider@example.com',
      password: 'supersecret1',
      fullName: 'Gov Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'gov-admin@example.com',
      password: 'supersecret1',
      fullName: 'Gov Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'gov-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('a non-admin is forbidden', async () => {
    const res = await request(app).get('/api/governance/audit-events-admin').set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 403);
  });

  test('an unauthenticated caller is rejected', async () => {
    const res = await request(app).get('/api/governance/audit-events-admin');
    assert.equal(res.status, 401);
  });

  test('an admin gets the audit trail, including this run\'s user.registered events', async () => {
    const res = await request(app).get('/api/governance/audit-events-admin').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.some((e) => e.event_type === 'user.registered'));
  });

  test('?entityType= filters without requiring entityId (a gap the original /audit-events route had)', async () => {
    const res = await request(app)
      .get('/api/governance/audit-events-admin?entityType=user')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length > 0);
    assert.ok(res.body.events.every((e) => e.entity_type === 'user'));
  });

  test('does not weaken the original /audit-events route (still admin-gated)', async () => {
    const res = await request(app).get('/api/governance/audit-events').set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 403);
  });
});

describe('GET /api/admin/funnel-stats (Phase 7)', () => {
  let app;
  let cleanup;
  let adminToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
    const admin = await request(app).post('/api/users/register').send({
      email: 'funnel-stats-admin@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Stats Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'funnel-stats-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('requires admin', async () => {
    const res = await request(app).get('/api/admin/funnel-stats');
    assert.equal(res.status, 401);
  });

  test('returns all five funnel steps in order, each with a count', async () => {
    const res = await request(app).get('/api/admin/funnel-stats').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.steps.map((s) => s.eventType),
      ['signup_started', 'signup_completed', 'first_journey_posted', 'first_booking_made', 'booking_completed']
    );
    // The admin account created in before() produced one signup_completed.
    const signupCompleted = res.body.steps.find((s) => s.eventType === 'signup_completed');
    assert.ok(signupCompleted.count >= 1);
  });
});
