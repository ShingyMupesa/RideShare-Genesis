import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('journeys + matching + Decision DNA', () => {
  let app;
  let cleanup;
  let driverToken;
  let riderToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'driver@example.com',
      password: 'supersecret1',
      fullName: 'Diana Driver',
    });
    driverToken = driver.body.token;

    const rider = await request(app).post('/api/users/register').send({
      email: 'rider@example.com',
      password: 'supersecret1',
      fullName: 'Ravi Rider',
    });
    riderToken = rider.body.token;
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
      });
    const matchId = journeyRes.body.matches[0].id;

    const res = await request(app)
      .post(`/api/matching/${matchId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 403);
  });

  test('lists active offer journeys publicly', async () => {
    const res = await request(app).get('/api/journeys?type=offer&status=active');
    assert.equal(res.status, 200);
    assert.ok(res.body.journeys.length >= 1);
  });
});
