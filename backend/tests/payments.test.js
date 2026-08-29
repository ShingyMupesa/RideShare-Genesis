import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('payment-choice architecture', () => {
  let app;
  let cleanup;
  let driverToken;
  let riderToken;
  let bookingId;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'pdriver@example.com',
      password: 'supersecret1',
      fullName: 'Pia Driver',
    });
    driverToken = driver.body.token;

    const rider = await request(app).post('/api/users/register').send({
      email: 'prider@example.com',
      password: 'supersecret1',
      fullName: 'Paul Rider',
    });
    riderToken = rider.body.token;

    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'A', lat: 0, lng: 0 },
        destination: { label: 'B', lat: 1, lng: 1 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 15,
        currency: 'USD',
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId: journeyRes.body.journey.id, seats: 1 });
    bookingId = bookingRes.body.booking.id;
  });

  after(() => cleanup());

  test('lists supported payment methods', async () => {
    const res = await request(app).get('/api/payments/methods');
    assert.equal(res.status, 200);
    assert.ok(res.body.methods.includes('card'));
    assert.ok(res.body.methods.includes('mobile_money'));
    assert.ok(res.body.methods.includes('cash'));
    assert.ok(res.body.methods.includes('wallet'));
  });

  test('rejects an unsupported payment method', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, method: 'bitcoin' });
    assert.equal(res.status, 400);
  });

  test('only the passenger can pay for the booking', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ bookingId, method: 'card' });
    assert.equal(res.status, 403);
  });

  test('pays via wallet (zero-failure sandbox provider) and captures', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId, method: 'wallet' });
    assert.equal(res.status, 201);
    assert.equal(res.body.payment.status, 'CAPTURED');
    assert.equal(res.body.payment.amount, 15);
  });

  test('lists payments for a booking', async () => {
    const res = await request(app)
      .get(`/api/payments/booking/${bookingId}`)
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.payments.length >= 1);
  });
});
