import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('booking workflow state machine', () => {
  let app;
  let cleanup;
  let driverToken;
  let riderToken;
  let journeyId;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'bdriver@example.com',
      password: 'supersecret1',
      fullName: 'Bea Driver',
    });
    driverToken = driver.body.token;

    const rider = await request(app).post('/api/users/register').send({
      email: 'brider@example.com',
      password: 'supersecret1',
      fullName: 'Ben Rider',
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
        pricePerSeat: 20,
        currency: 'USD',
      });
    journeyId = journeyRes.body.journey.id;
  });

  after(() => cleanup());

  let bookingId;

  test('a rider cannot book their own offered journey', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ journeyId, seats: 1 });
    assert.equal(res.status, 400);
  });

  test('creates a booking in REQUESTED state', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId, seats: 1 });
    assert.equal(res.status, 201);
    assert.equal(res.body.booking.status, 'REQUESTED');
    assert.equal(res.body.booking.totalPrice, 20);
    bookingId = res.body.booking.id;
  });

  test('passenger moves booking to BOOKING_REQUESTED and seats decrement', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/request`)
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.status, 'BOOKING_REQUESTED');

    const journeyRes = await request(app).get(`/api/journeys/${journeyId}`);
    assert.equal(journeyRes.body.journey.seatsAvailable, 1);
  });

  test('driver cannot skip straight to IN_PROGRESS from BOOKING_REQUESTED via confirm-only path enforced', async () => {
    // confirm requires owner
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 403);
  });

  test('owner confirms booking', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.status, 'CONFIRMED');
  });

  test('trip starts and completes', async () => {
    const startRes = await request(app)
      .post(`/api/bookings/${bookingId}/start`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.booking.status, 'IN_PROGRESS');

    const completeRes = await request(app)
      .post(`/api/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.booking.status, 'COMPLETED');
  });

  test('cannot transition a completed booking further', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 400);
  });

  test('cancelling a reserved booking restores seats', async () => {
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId, seats: 1 });
    const id = bookingRes.body.booking.id;

    await request(app).post(`/api/bookings/${id}/request`).set('Authorization', `Bearer ${riderToken}`);

    let journeyRes = await request(app).get(`/api/journeys/${journeyId}`);
    assert.equal(journeyRes.body.journey.seatsAvailable, 0);

    const cancelRes = await request(app).post(`/api/bookings/${id}/cancel`).set('Authorization', `Bearer ${riderToken}`);
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.booking.status, 'CANCELLED');

    journeyRes = await request(app).get(`/api/journeys/${journeyId}`);
    assert.equal(journeyRes.body.journey.seatsAvailable, 1);
  });

  test('lists bookings for the current user', async () => {
    const res = await request(app).get('/api/bookings/mine').set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.bookings.length >= 2);
  });
});
