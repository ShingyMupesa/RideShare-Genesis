import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('monetization: driver subscription plans + subscriptions', () => {
  let app;
  let cleanup;
  let adminToken;
  let driverToken;
  let driverId;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'msub-driver@example.com',
      password: 'supersecret1',
      fullName: 'Mona Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;
    driverId = driver.body.user.id;

    const admin = await request(app).post('/api/users/register').send({
      email: 'msub-admin@example.com',
      password: 'supersecret1',
      fullName: 'Mona Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'msub-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('a non-admin cannot list or create subscription plans', async () => {
    const list = await request(app).get('/api/admin/subscription-plans').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(list.status, 403);
    const create = await request(app)
      .post('/api/admin/subscription-plans')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ name: 'Should not work', priceAmount: 10, currency: 'KES' });
    assert.equal(create.status, 403);
  });

  test('the public plans endpoint is empty before any plan is created', async () => {
    const res = await request(app).get('/api/monetization/plans');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.plans, []);
  });

  let activePlanId;
  let inactivePlanId;

  test('admin can create a subscription plan', async () => {
    const res = await request(app)
      .post('/api/admin/subscription-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gold Driver',
        description: 'Priority matching',
        priceAmount: 500,
        currency: 'KES',
        billingPeriod: 'monthly',
        perks: ['Priority matching', 'Lower commission'],
        active: true,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.plan.name, 'Gold Driver');
    assert.equal(res.body.plan.active, true);
    assert.deepEqual(res.body.plan.perks, ['Priority matching', 'Lower commission']);
    activePlanId = res.body.plan.id;
  });

  test('admin can create a second, inactive plan', async () => {
    const res = await request(app)
      .post('/api/admin/subscription-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Draft plan', priceAmount: 100, currency: 'KES', active: false });
    assert.equal(res.status, 201);
    assert.equal(res.body.plan.active, false);
    inactivePlanId = res.body.plan.id;
  });

  test('rejects an invalid billingPeriod', async () => {
    const res = await request(app)
      .post('/api/admin/subscription-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad period', billingPeriod: 'daily' });
    assert.equal(res.status, 400);
  });

  test('the public plans endpoint only returns active=1 rows', async () => {
    const res = await request(app).get('/api/monetization/plans');
    assert.equal(res.status, 200);
    const ids = res.body.plans.map((p) => p.id);
    assert.ok(ids.includes(activePlanId));
    assert.ok(!ids.includes(inactivePlanId));
  });

  test('admin can update a plan', async () => {
    const res = await request(app)
      .put(`/api/admin/subscription-plans/${activePlanId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceAmount: 600 });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.priceAmount, 600);
    assert.equal(res.body.plan.name, 'Gold Driver'); // untouched fields survive a partial update
  });

  let subscriptionId;

  test('admin can manually assign a driver to a plan', async () => {
    const res = await request(app)
      .post('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: driverId, planId: activePlanId });
    assert.equal(res.status, 201);
    assert.equal(res.body.subscription.status, 'active');
    assert.equal(res.body.subscription.planId, activePlanId);
    subscriptionId = res.body.subscription.id;
  });

  test('a non-admin cannot list or create subscriptions', async () => {
    const list = await request(app).get('/api/admin/subscriptions').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(list.status, 403);
    const create = await request(app)
      .post('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ userId: driverId, planId: activePlanId });
    assert.equal(create.status, 403);
  });

  test('assigning a subscription to a nonexistent plan 404s', async () => {
    const res = await request(app)
      .post('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: driverId, planId: 'nope' });
    assert.equal(res.status, 404);
  });

  test('admin can list subscriptions, joined with user + plan info', async () => {
    const res = await request(app).get('/api/admin/subscriptions').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const row = res.body.subscriptions.find((s) => s.id === subscriptionId);
    assert.ok(row);
    assert.equal(row.planName, 'Gold Driver');
    assert.equal(row.userEmail, 'msub-driver@example.com');
  });

  test('deactivating a plan with an existing subscription soft-deletes it without orphaning the subscription row', async () => {
    const res = await request(app)
      .delete(`/api/admin/subscription-plans/${activePlanId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.active, false);

    // The plan row itself still exists (soft-delete, never a hard delete).
    const stillThere = await request(app).get('/api/admin/subscription-plans').set('Authorization', `Bearer ${adminToken}`);
    assert.ok(stillThere.body.plans.some((p) => p.id === activePlanId));

    // The subscription row is untouched and still points at the (now
    // inactive) plan — the FK is ON DELETE RESTRICT precisely so a hard
    // delete could never have silently orphaned it either.
    const subsAfter = await request(app).get('/api/admin/subscriptions').set('Authorization', `Bearer ${adminToken}`);
    const row = subsAfter.body.subscriptions.find((s) => s.id === subscriptionId);
    assert.ok(row);
    assert.equal(row.status, 'active');
    assert.equal(row.planId, activePlanId);
  });

  test('a non-admin cannot update or deactivate a plan', async () => {
    const update = await request(app)
      .put(`/api/admin/subscription-plans/${inactivePlanId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceAmount: 1 });
    assert.equal(update.status, 403);
    const del = await request(app).delete(`/api/admin/subscription-plans/${inactivePlanId}`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(del.status, 403);
  });
});
