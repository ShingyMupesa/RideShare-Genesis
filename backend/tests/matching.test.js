import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('journeys + matching + Decision DNA', () => {
  let app;
  let cleanup;
  let driverToken;
  let riderToken;
  let strangerToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'driver@example.com',
      password: 'supersecret1',
      fullName: 'Diana Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const rider = await request(app).post('/api/users/register').send({
      email: 'rider@example.com',
      password: 'supersecret1',
      fullName: 'Ravi Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;

    const stranger = await request(app).post('/api/users/register').send({
      email: 'stranger@example.com',
      password: 'supersecret1',
      fullName: 'Sam Stranger',
      acceptedTerms: true,
    });
    strangerToken = stranger.body.token;
  });

  after(() => cleanup());

  const departure = new Date(Date.now() + 3600_000).toISOString();

  test('offering a journey does not auto-generate matches', async () => {
    const res = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: departure,
        seats: 3,
        pricePerSeat: 10,
        currency: 'USD',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.matches.length, 0);
    assert.equal(res.body.journey.seatsAvailable, 3);
  });

  test('requesting a nearby journey returns a scored, explainable match', async () => {
    const res = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'Downtown Plaza', lat: -1.293, lng: 36.822 },
        destination: { label: 'Airport Terminal', lat: -1.318, lng: 36.929 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.matches.length >= 1);

    const match = res.body.matches[0];
    assert.ok(match.score > 0.5);
    assert.ok(match.decisionDna.factors.proximity);
    assert.ok(match.decisionDna.factors.timing);
    assert.ok(match.decisionDna.narrative.length > 0);
  });

  test('match explanation endpoint returns full factor breakdown', async () => {
    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'Downtown Plaza', lat: -1.293, lng: 36.822 },
        destination: { label: 'Airport Terminal', lat: -1.318, lng: 36.929 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });

    const matchId = journeyRes.body.matches[0].id;
    const explanationRes = await request(app)
      .get(`/api/matching/${matchId}/explanation`)
      .set('Authorization', `Bearer ${riderToken}`);

    assert.equal(explanationRes.status, 200);
    assert.ok(explanationRes.body.narrative);
    assert.ok(explanationRes.body.factors.reliability);
  });

  test('a stranger cannot accept someone else\'s match', async () => {
    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'Downtown Plaza', lat: -1.293, lng: 36.822 },
        destination: { label: 'Airport Terminal', lat: -1.318, lng: 36.929 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const matchId = journeyRes.body.matches[0].id;

    const res = await request(app)
      .post(`/api/matching/${matchId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 403);
  });

  test('a stranger with no stake in the match cannot view it or its explanation', async () => {
    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'Downtown Plaza', lat: -1.293, lng: 36.822 },
        destination: { label: 'Airport Terminal', lat: -1.318, lng: 36.929 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const matchId = journeyRes.body.matches[0].id;

    const matchRes = await request(app).get(`/api/matching/${matchId}`).set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(matchRes.status, 403);

    const explanationRes = await request(app)
      .get(`/api/matching/${matchId}/explanation`)
      .set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(explanationRes.status, 403);

    // The two actual parties to the match can still view it.
    const riderRes = await request(app).get(`/api/matching/${matchId}`).set('Authorization', `Bearer ${riderToken}`);
    assert.equal(riderRes.status, 200);
    const driverRes = await request(app).get(`/api/matching/${matchId}`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(driverRes.status, 200);
  });

  test('lists active offer journeys publicly', async () => {
    const res = await request(app).get('/api/journeys?type=offer&status=active');
    assert.equal(res.status, 200);
    assert.ok(res.body.journeys.length >= 1);
  });

  test('an offer journey is publicly viewable by id, even unauthenticated', async () => {
    const offerRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'X', lat: 0, lng: 0 },
        destination: { label: 'Y', lat: 1, lng: 1 },
        departureTime: departure,
        seats: 2,
        pricePerSeat: 5,
        currency: 'USD',
      });

    const res = await request(app).get(`/api/journeys/${offerRes.body.journey.id}`);
    assert.equal(res.status, 200);
  });

  test('a request journey is private: owner can view it, no one else can', async () => {
    const requestRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'Private Origin', lat: -1.3, lng: 36.8 },
        destination: { label: 'Private Destination', lat: -1.32, lng: 36.93 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const journeyId = requestRes.body.journey.id;

    const anonRes = await request(app).get(`/api/journeys/${journeyId}`);
    assert.equal(anonRes.status, 403);

    const strangerRes = await request(app).get(`/api/journeys/${journeyId}`).set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(strangerRes.status, 403);

    const ownerRes = await request(app).get(`/api/journeys/${journeyId}`).set('Authorization', `Bearer ${riderToken}`);
    assert.equal(ownerRes.status, 200);
  });

  test('the journeys list redacts exact coordinates and owner id for other people\'s request journeys', async () => {
    const requestRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        type: 'request',
        origin: { label: 'List Redaction Origin', lat: -1.301, lng: 36.801 },
        destination: { label: 'List Redaction Destination', lat: -1.321, lng: 36.931 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const journeyId = requestRes.body.journey.id;

    const strangerListRes = await request(app)
      .get('/api/journeys?type=request&status=active')
      .set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(strangerListRes.status, 200);
    const seenByStranger = strangerListRes.body.journeys.find((j) => j.id === journeyId);
    assert.ok(seenByStranger, 'the request journey should still be listed');
    assert.equal(seenByStranger.ownerId, undefined);
    assert.equal(seenByStranger.origin.lat, undefined);
    assert.equal(seenByStranger.origin.lng, undefined);
    assert.equal(seenByStranger.destination.lat, undefined);
    assert.equal(seenByStranger.origin.label, 'List Redaction Origin');

    const anonListRes = await request(app).get('/api/journeys?type=request&status=active');
    const seenByAnon = anonListRes.body.journeys.find((j) => j.id === journeyId);
    assert.equal(seenByAnon.ownerId, undefined);
    assert.equal(seenByAnon.origin.lat, undefined);

    const ownerListRes = await request(app)
      .get('/api/journeys?type=request&status=active&mine=true')
      .set('Authorization', `Bearer ${riderToken}`);
    const seenByOwner = ownerListRes.body.journeys.find((j) => j.id === journeyId);
    assert.equal(seenByOwner.origin.lat, -1.301);
    assert.equal(seenByOwner.ownerId, requestRes.body.journey.ownerId);
  });

  test('reliability factor is a real, queried signal — not a hardcoded constant', async () => {
    // A driver with no completed trips yet starts at the neutral baseline.
    const freshOfferRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Reliability Origin', lat: -1.29, lng: 36.82 },
        destination: { label: 'Reliability Destination', lat: -1.31, lng: 36.92 },
        departureTime: departure,
        seats: 3,
        pricePerSeat: 10,
        currency: 'USD',
      });

    const baselineRequestRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        type: 'request',
        origin: { label: 'Reliability Origin', lat: -1.29, lng: 36.82 },
        destination: { label: 'Reliability Destination', lat: -1.31, lng: 36.92 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const baselineMatch = baselineRequestRes.body.matches.find((m) => m.offerJourney.id === freshOfferRes.body.journey.id);
    assert.ok(baselineMatch, 'expected a match against the fresh offer');
    assert.equal(baselineMatch.decisionDna.factors.reliability.score, 0.6);
    assert.match(baselineMatch.decisionDna.factors.reliability.detail, /no completed trips/i);

    // Drive one booking against the driver's fresh offer all the way to
    // COMPLETED, then check the driver's reliability score reflects it.
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ journeyId: freshOfferRes.body.journey.id, seats: 1 });
    assert.equal(bookingRes.status, 201);
    const bookingId = bookingRes.body.booking.id;

    await request(app).post(`/api/bookings/${bookingId}/request`).set('Authorization', `Bearer ${strangerToken}`);
    await request(app).post(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${driverToken}`);
    await request(app).post(`/api/bookings/${bookingId}/start`).set('Authorization', `Bearer ${driverToken}`);
    const completeRes = await request(app).post(`/api/bookings/${bookingId}/complete`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(completeRes.status, 200);

    // A fresh match against the same driver should now score higher and
    // say so explicitly.
    const afterRequestRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        type: 'request',
        origin: { label: 'Reliability Origin', lat: -1.29, lng: 36.82 },
        destination: { label: 'Reliability Destination', lat: -1.31, lng: 36.92 },
        departureTime: departure,
        seats: 1,
        pricePerSeat: 12,
        currency: 'USD',
      });
    const afterMatch = afterRequestRes.body.matches.find((m) => m.offerJourney.id === freshOfferRes.body.journey.id);
    assert.ok(afterMatch, 'expected a match against the now-experienced driver');
    assert.equal(afterMatch.decisionDna.factors.reliability.score, 0.65);
    assert.match(afterMatch.decisionDna.factors.reliability.detail, /1 completed trip on Genesis/);
  });
});
