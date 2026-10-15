import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('admin list endpoints (Phase 7)', () => {
  let app;
  let cleanup;
  let adminToken;
  let riderToken;
  let driverId;
  let journeyId;
  let bookingId;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'al-driver@example.com',
      password: 'supersecret1',
      fullName: 'Al Driver',
      acceptedTerms: true,
    });
    driverId = driver.body.user.id;

    const rider = await request(app).post('/api/users/register').send({
      email: 'al-rider@example.com',
      password: 'supersecret1',
      fullName: 'Al Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'al-admin@example.com',
      password: 'supersecret1',
      fullName: 'Al Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'al-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;

    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driver.body.token}`)
      .send({
        type: 'offer',
        origin: { label: 'Origin', lat: 0, lng: 0 },
        destination: { label: 'Dest', lat: 1, lng: 1 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 15,
        currency: 'USD',
      });
    journeyId = journeyRes.body.journey.id;

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId, seats: 1 });
    bookingId = bookingRes.body.booking.id;

    await request(app).post('/api/payments').set('Authorization', `Bearer ${riderToken}`).send({ bookingId, method: 'wallet' });
  });

  after(() => cleanup());

  describe('GET /api/admin/users', () => {
    test('requires admin', async () => {
      const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.status, 403);
    });

    test('returns the { items, page, pageSize, total } pagination shape', async () => {
      const res = await request(app).get('/api/admin/users?page=1&pageSize=2').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.pageSize, 2);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length <= 2);
      assert.ok(res.body.total >= 3);
    });

    test('?search= filters by name/email', async () => {
      const res = await request(app).get('/api/admin/users?search=al-driver').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.every((u) => u.email.includes('al-driver') || u.fullName.includes('al-driver')));
      assert.ok(res.body.items.some((u) => u.id === driverId));
    });

    test('?type=driver includes the user who posted an offer journey', async () => {
      const res = await request(app).get('/api/admin/users?type=driver').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.some((u) => u.id === driverId));
      assert.ok(res.body.items.every((u) => u.isDriver === true));
    });

    test('?type=passenger includes the user who made a booking, not the driver-only user', async () => {
      const res = await request(app).get('/api/admin/users?type=passenger').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.every((u) => u.isPassenger === true));
      assert.ok(!res.body.items.some((u) => u.id === driverId));
    });

    test('pageSize is capped at 200', async () => {
      const res = await request(app).get('/api/admin/users?pageSize=9999').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.pageSize, 200);
    });
  });

  describe('GET /api/admin/users/export.csv', () => {
    test('requires admin', async () => {
      const res = await request(app).get('/api/admin/users/export.csv').set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.status, 403);
    });

    test('streams CSV with the right content-type/content-disposition and escapes embedded commas/quotes', async () => {
      const { db } = await import('../src/db/connection.js');
      // A name containing a comma and a quote exercises the escaping helper.
      db.prepare("UPDATE users SET full_name = ? WHERE id = ?").run('Al "Driver", Jr.', driverId);

      const res = await request(app).get('/api/admin/users/export.csv').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.headers['content-disposition'], /attachment; filename="genesis-users-\d{4}-\d{2}-\d{2}\.csv"/);
      // The field must be quoted, with the embedded quote doubled.
      assert.match(res.text, /"Al ""Driver"", Jr\."/);
    });
  });

  describe('GET /api/admin/rides', () => {
    test('requires admin', async () => {
      const res = await request(app).get('/api/admin/rides').set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.status, 403);
    });

    test('returns the paginated shape and the posted journey', async () => {
      const res = await request(app).get('/api/admin/rides').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.some((r) => r.id === journeyId));
      assert.equal(typeof res.body.total, 'number');
    });

    test('?type=offer filters correctly', async () => {
      const res = await request(app).get('/api/admin/rides?type=offer').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.every((r) => r.type === 'offer'));
    });

    test('?type=request returns none here (only an offer journey was posted)', async () => {
      const res = await request(app).get('/api/admin/rides?type=request').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(!res.body.items.some((r) => r.id === journeyId));
    });
  });

  describe('GET /api/admin/payments', () => {
    test('requires admin', async () => {
      const res = await request(app).get('/api/admin/payments').set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.status, 403);
    });

    test('returns the paginated shape plus per-currency totals (never summed across currencies)', async () => {
      const res = await request(app).get('/api/admin/payments').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.some((p) => p.bookingId === bookingId));
      assert.ok(Array.isArray(res.body.totalsByCurrency));
      assert.ok(res.body.totalsByCurrency.every((t) => typeof t.currency === 'string'));
    });

    test('?status=CAPTURED filters correctly', async () => {
      const res = await request(app).get('/api/admin/payments?status=CAPTURED').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.every((p) => p.status === 'CAPTURED'));
    });

    test('?currency=KES (none posted in KES) returns an empty page, not an error', async () => {
      const res = await request(app).get('/api/admin/payments?currency=KES').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.items.length, 0);
    });
  });
});
