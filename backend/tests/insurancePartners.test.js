import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('monetization: insurance partners', () => {
  let app;
  let cleanup;
  let adminToken;
  let driverToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'ins-driver@example.com',
      password: 'supersecret1',
      fullName: 'Ina Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'ins-admin@example.com',
      password: 'supersecret1',
      fullName: 'Ins Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'ins-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('a non-admin cannot list or create insurance partners', async () => {
    const list = await request(app).get('/api/admin/insurance-partners').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(list.status, 403);
    const create = await request(app)
      .post('/api/admin/insurance-partners')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ name: 'Should not work' });
    assert.equal(create.status, 403);
  });

  test('rejects a missing name', async () => {
    const res = await request(app).post('/api/admin/insurance-partners').set('Authorization', `Bearer ${adminToken}`).send({ contactEmail: 'a@b.com' });
    assert.equal(res.status, 400);
  });

  let partnerId;

  test('admin can create an insurance partner, inactive by default', async () => {
    const res = await request(app)
      .post('/api/admin/insurance-partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SafeDrive Cover', contactEmail: 'partnerships@safedrive.example', productDesc: 'Third-party cover for drivers' });
    assert.equal(res.status, 201);
    assert.equal(res.body.insurancePartner.active, false);
    partnerId = res.body.insurancePartner.id;
  });

  test('admin can update an insurance partner', async () => {
    const res = await request(app)
      .put(`/api/admin/insurance-partners/${partnerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: true, referralUrl: 'https://safedrive.example/refer' });
    assert.equal(res.status, 200);
    assert.equal(res.body.insurancePartner.active, true);
    assert.equal(res.body.insurancePartner.referralUrl, 'https://safedrive.example/refer');
    assert.equal(res.body.insurancePartner.name, 'SafeDrive Cover'); // untouched field survives
  });

  test('updating a nonexistent partner 404s', async () => {
    const res = await request(app).put('/api/admin/insurance-partners/nope').set('Authorization', `Bearer ${adminToken}`).send({ name: 'x' });
    assert.equal(res.status, 404);
  });

  test('admin can list insurance partners', async () => {
    const res = await request(app).get('/api/admin/insurance-partners').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.insurancePartners.some((p) => p.id === partnerId));
  });

  test('deactivating soft-deletes (never hard-deletes) the row', async () => {
    const res = await request(app).delete(`/api/admin/insurance-partners/${partnerId}`).set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.insurancePartner.active, false);

    const list = await request(app).get('/api/admin/insurance-partners').set('Authorization', `Bearer ${adminToken}`);
    assert.ok(list.body.insurancePartners.some((p) => p.id === partnerId));
  });

  test('a non-admin cannot update or deactivate a partner', async () => {
    const update = await request(app)
      .put(`/api/admin/insurance-partners/${partnerId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ active: true });
    assert.equal(update.status, 403);
    const del = await request(app).delete(`/api/admin/insurance-partners/${partnerId}`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(del.status, 403);
  });
});
