import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('disputes', () => {
  let app;
  let cleanup;
  let driverToken;
  let driverId;
  let riderToken;
  let strangerToken;
  let adminToken;
  let bookingId;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'ddriver@example.com',
      password: 'supersecret1',
      fullName: 'Dana Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;
    driverId = driver.body.user.id;

    const rider = await request(app).post('/api/users/register').send({
      email: 'drider@example.com',
      password: 'supersecret1',
      fullName: 'Rae Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;

    const stranger = await request(app).post('/api/users/register').send({
      email: 'dstranger@example.com',
      password: 'supersecret1',
      fullName: 'Sam Stranger',
      acceptedTerms: true,
    });
    strangerToken = stranger.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'dadmin@example.com',
      password: 'supersecret1',
      fullName: 'Ada Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'dadmin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;

    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'A', lat: 0, lng: 0 },
        destination: { label: 'B', lat: 1, lng: 1 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 20,
        currency: 'USD',
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId: journeyRes.body.journey.id, seats: 1 });
    bookingId = bookingRes.body.booking.id;

    // Pay via the zero-failure sandbox wallet provider so there's a
    // CAPTURED payment on file for the dispute to default its amount from
    // and later refund.
    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, method: 'wallet' });
  });

  after(() => cleanup());

  test('someone with no access to the booking cannot file a dispute', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ bookingId, category: 'fare_dispute', description: 'Not my booking' });
    assert.equal(res.status, 403);
  });

  test('rejects an invalid category', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, category: 'not_a_real_category', description: 'Something happened' });
    assert.equal(res.status, 400);
  });

  test('rejects a missing description', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, category: 'fare_dispute' });
    assert.equal(res.status, 400);
  });

  let disputeId;

  test('the passenger can file a dispute, defaulting the amount from the captured payment', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, category: 'fare_dispute', description: 'Charged more than agreed' });
    assert.equal(res.status, 201);
    assert.equal(res.body.dispute.status, 'open');
    assert.equal(res.body.dispute.disputedAmount, 20);
    assert.equal(res.body.dispute.currency, 'USD');
    assert.equal(res.body.dispute.againstUserId, driverId); // defaults to the counterparty (the journey owner)
    disputeId = res.body.dispute.id;
  });

  test('a non-admin cannot list all disputes', async () => {
    const res = await request(app)
      .get('/api/disputes')
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 403);
  });

  test('a non-admin cannot resolve a dispute', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ resolution: 'resolved_denied', resolutionNote: 'nope', resolvedBy: 'rider' });
    assert.equal(res.status, 403);
  });

  test('the filer sees their dispute under /mine', async () => {
    const res = await request(app)
      .get('/api/disputes/mine')
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.disputes.some((d) => d.id === disputeId));
  });

  test('admin can list disputes with the paginated response shape', async () => {
    const res = await request(app)
      .get('/api/disputes?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.pageSize, 10);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.total >= 1);
  });

  test('admin can filter the list by status', async () => {
    const res = await request(app)
      .get('/api/disputes?status=open')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((d) => d.status === 'open'));
  });

  test('admin resolving as resolved_refunded flips the linked payment to REFUNDED', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'resolved_refunded', resolutionNote: 'Refunded in full', resolvedBy: 'Ada Admin' });
    assert.equal(res.status, 200);
    assert.equal(res.body.dispute.status, 'resolved_refunded');
    assert.equal(res.body.dispute.resolutionNote, 'Refunded in full');
    assert.ok(res.body.payment, 'expected a touched payment in the response');
    assert.equal(res.body.payment.status, 'REFUNDED');
  });

  test('an invalid resolution value is rejected', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'made_up_status', resolutionNote: 'x', resolvedBy: 'Ada Admin' });
    assert.equal(res.status, 400);
  });
});
