import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('monetization: ad slots', () => {
  let app;
  let cleanup;
  let adminToken;
  let driverToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'ads-driver@example.com',
      password: 'supersecret1',
      fullName: 'Ada Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'ads-admin@example.com',
      password: 'supersecret1',
      fullName: 'Ads Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'ads-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('a non-admin cannot list or create ad slots', async () => {
    const list = await request(app).get('/api/admin/ad-slots').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(list.status, 403);
    const create = await request(app)
      .post('/api/admin/ad-slots')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ placement: 'home', name: 'Should not work' });
    assert.equal(create.status, 403);
  });

  test('rejects a missing placement or name', async () => {
    const res = await request(app).post('/api/admin/ad-slots').set('Authorization', `Bearer ${adminToken}`).send({ name: 'No placement' });
    assert.equal(res.status, 400);
  });

  let slotId;

  test('admin can create an ad slot, inactive by default', async () => {
    const res = await request(app)
      .post('/api/admin/ad-slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ placement: 'booking_confirmation', name: 'Launch banner', creativeUrl: 'https://example.com/a.png' });
    assert.equal(res.status, 201);
    assert.equal(res.body.adSlot.active, false);
    slotId = res.body.adSlot.id;
  });

  test('admin can update an ad slot', async () => {
    const res = await request(app)
      .put(`/api/admin/ad-slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: true, targetUrl: 'https://example.com/promo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.adSlot.active, true);
    assert.equal(res.body.adSlot.targetUrl, 'https://example.com/promo');
    assert.equal(res.body.adSlot.name, 'Launch banner'); // untouched field survives
  });

  test('updating a nonexistent ad slot 404s', async () => {
    const res = await request(app).put('/api/admin/ad-slots/nope').set('Authorization', `Bearer ${adminToken}`).send({ name: 'x' });
    assert.equal(res.status, 404);
  });

  test('admin can list ad slots', async () => {
    const res = await request(app).get('/api/admin/ad-slots').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.adSlots.some((s) => s.id === slotId));
  });

  test('deactivating soft-deletes (never hard-deletes) the row', async () => {
    const res = await request(app).delete(`/api/admin/ad-slots/${slotId}`).set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.adSlot.active, false);

    const list = await request(app).get('/api/admin/ad-slots').set('Authorization', `Bearer ${adminToken}`);
    assert.ok(list.body.adSlots.some((s) => s.id === slotId));
  });

  test('a non-admin cannot update or deactivate an ad slot', async () => {
    const update = await request(app).put(`/api/admin/ad-slots/${slotId}`).set('Authorization', `Bearer ${driverToken}`).send({ active: true });
    assert.equal(update.status, 403);
    const del = await request(app).delete(`/api/admin/ad-slots/${slotId}`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(del.status, 403);
  });
});
