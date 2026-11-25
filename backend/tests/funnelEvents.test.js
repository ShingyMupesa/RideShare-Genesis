import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('funnel instrumentation (Phase 7)', () => {
  let app;
  let cleanup;
  let db;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
    ({ db } = await import('../src/db/connection.js'));
  });

  after(() => cleanup());

  function eventsFor(userId, eventType) {
    return db
      .prepare('SELECT * FROM funnel_events WHERE user_id = ? AND event_type = ? ORDER BY created_at ASC')
      .all(userId, eventType);
  }

  test('registering records a signup_completed funnel event for the new user', async () => {
    const res = await request(app).post('/api/users/register').send({
      email: 'funnel-signup@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Signup',
      acceptedTerms: true,
    });
    assert.equal(res.status, 201);
    const events = eventsFor(res.body.user.id, 'signup_completed');
    assert.equal(events.length, 1);
  });

  test('POST /api/tracking/funnel rejects an unrecognised eventType with 400', async () => {
    const res = await request(app).post('/api/tracking/funnel').send({ eventType: 'not_a_real_event' });
    assert.equal(res.status, 400);
  });

  test('POST /api/tracking/funnel accepts signup_started with no auth (anonymous, pre-account)', async () => {
    const res = await request(app).post('/api/tracking/funnel').send({ eventType: 'signup_started', visitorId: 'visitor-abc' });
    assert.equal(res.status, 201);
    const row = db
      .prepare('SELECT * FROM funnel_events WHERE event_type = ? AND visitor_id = ?')
      .get('signup_started', 'visitor-abc');
    assert.ok(row, 'expected a row with the anonymous visitor id');
    assert.equal(row.user_id, null);
  });

  test('POST /api/tracking/funnel attaches user_id when an Authorization token is present (optionalAuth)', async () => {
    const reg = await request(app).post('/api/users/register').send({
      email: 'funnel-auth@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Auth',
      acceptedTerms: true,
    });
    const res = await request(app)
      .post('/api/tracking/funnel')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ eventType: 'signup_started' });
    assert.equal(res.status, 201);
    const events = eventsFor(reg.body.user.id, 'signup_started');
    assert.equal(events.length, 1);
  });

  test('first_journey_posted fires once for a user\'s first journey (of any type) and never again', async () => {
    const owner = await request(app).post('/api/users/register').send({
      email: 'funnel-owner@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Owner',
      acceptedTerms: true,
    });
    const ownerId = owner.body.user.id;
    const ownerToken = owner.body.token;

    const journeyPayload = {
      type: 'offer',
      origin: { label: 'A', lat: 0, lng: 0 },
      destination: { label: 'B', lat: 1, lng: 1 },
      departureTime: new Date(Date.now() + 3600_000).toISOString(),
      seats: 2,
      pricePerSeat: 10,
      currency: 'USD',
    };

    const first = await request(app).post('/api/journeys').set('Authorization', `Bearer ${ownerToken}`).send(journeyPayload);
    assert.equal(first.status, 201);
    assert.equal(eventsFor(ownerId, 'first_journey_posted').length, 1);

    const second = await request(app).post('/api/journeys').set('Authorization', `Bearer ${ownerToken}`).send(journeyPayload);
    assert.equal(second.status, 201);
    // Still just one — the second journey from the same owner is not "first".
    assert.equal(eventsFor(ownerId, 'first_journey_posted').length, 1);
  });

  test('first_booking_made fires once per passenger, and booking_completed fires every time a booking completes (not just the first)', async () => {
    const driver = await request(app).post('/api/users/register').send({
      email: 'funnel-driver@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Driver',
      acceptedTerms: true,
    });
    const driverToken = driver.body.token;

    const passenger = await request(app).post('/api/users/register').send({
      email: 'funnel-passenger@example.com',
      password: 'supersecret1',
      fullName: 'Funnel Passenger',
      acceptedTerms: true,
    });
    const passengerId = passenger.body.user.id;
    const passengerToken = passenger.body.token;

    async function postJourney() {
      const res = await request(app)
        .post('/api/journeys')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          type: 'offer',
          origin: { label: 'A', lat: 0, lng: 0 },
          destination: { label: 'B', lat: 1, lng: 1 },
          departureTime: new Date(Date.now() + 3600_000).toISOString(),
          seats: 2,
          pricePerSeat: 10,
          currency: 'USD',
        });
      return res.body.journey.id;
    }

    async function completeNewBooking() {
      const journeyId = await postJourney();
      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ journeyId, seats: 1 });
      const bookingId = bookingRes.body.booking.id;

      await request(app).post(`/api/bookings/${bookingId}/request`).set('Authorization', `Bearer ${passengerToken}`);
      await request(app).post(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${driverToken}`);
      await request(app).post(`/api/bookings/${bookingId}/start`).set('Authorization', `Bearer ${passengerToken}`);
      const completeRes = await request(app)
        .post(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${passengerToken}`);
      assert.equal(completeRes.status, 200);
      return bookingId;
    }

    // First booking created at all -> first_booking_made fires once, here.
    await completeNewBooking();
    assert.equal(eventsFor(passengerId, 'first_booking_made').length, 1);
    assert.equal(eventsFor(passengerId, 'booking_completed').length, 1);

    // A second, independent booking by the same passenger: first_booking_made
    // must NOT fire again, but booking_completed (a repeatable step) must.
    await completeNewBooking();
    assert.equal(eventsFor(passengerId, 'first_booking_made').length, 1);
    assert.equal(eventsFor(passengerId, 'booking_completed').length, 2);
  });
});
