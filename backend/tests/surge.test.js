import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('surge advisory (Phase 5)', () => {
  let app;
  let cleanup;
  let driverToken;
  let adminToken;

  // A fixed point/time every fixture journey below is placed relative to,
  // so demand/supply counts are deterministic.
  const HUB = { lat: -1.2921, lng: 36.8219 }; // Nairobi downtown
  const DEPARTURE = new Date(Date.now() + 3 * 3600_000).toISOString();

  async function postJourney(token, { type, lat, lng, departureTime = DEPARTURE }) {
    return request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type,
        origin: { label: 'Origin', lat, lng },
        destination: { label: 'Destination', lat: lat + 0.1, lng: lng + 0.1 },
        departureTime,
        seats: 2,
        pricePerSeat: 10,
        currency: 'USD',
      });
  }

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'surge-driver@example.com',
      password: 'supersecret1',
      fullName: 'Sandra Surgedriver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'surge-admin@example.com',
      password: 'supersecret1',
      fullName: 'Avi Surgeadmin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'surge-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => {
    cleanup();
  });

  test('demand-ratio calculation with known fixture data: 1 offer vs 0 requests nearby is not suggested', async () => {
    await postJourney(driverToken, { type: 'offer', lat: HUB.lat, lng: HUB.lng });

    const { estimateDemand } = await import('../src/journeys/surge.js');
    const result = estimateDemand({ lat: HUB.lat, lng: HUB.lng, departureTime: DEPARTURE });
    assert.equal(result.supplyCount, 1);
    assert.equal(result.demandCount, 0);
    assert.equal(result.demandRatio, 0);
    assert.equal(result.suggested, false);
    assert.equal(result.suggestedMultiplier, 1);
  });

  test('demand-ratio calculation: 4 requests vs 1 offer nearby (ratio 4) crosses the threshold and is suggested', async () => {
    // 1 offer already posted in the previous test; add 4 nearby requests so
    // demandCount=4, supplyCount=1, demandRatio=4 (> 1.5 threshold).
    for (let i = 0; i < 4; i += 1) {
      const rider = await request(app).post('/api/users/register').send({
        email: `surge-rider-${i}@example.com`,
        password: 'supersecret1',
        fullName: `Rider ${i}`,
        acceptedTerms: true,
      });
      // Slightly jittered coordinates, still well within the 10km radius.
      await postJourney(rider.body.token, { type: 'request', lat: HUB.lat + 0.001 * i, lng: HUB.lng + 0.001 * i });
    }

    const { estimateDemand } = await import('../src/journeys/surge.js');
    const result = estimateDemand({ lat: HUB.lat, lng: HUB.lng, departureTime: DEPARTURE });
    assert.equal(result.supplyCount, 1);
    assert.equal(result.demandCount, 4);
    assert.equal(result.demandRatio, 4);
    assert.equal(result.suggested, true);
    // scaled = 1 + (4 - 1.5) * 0.25 = 1.625, capped at default 1.5.
    assert.equal(result.suggestedMultiplier, 1.5);
  });

  test('a journey far outside the 10km radius is not counted as demand or supply', async () => {
    const farRider = await request(app).post('/api/users/register').send({
      email: 'surge-far-rider@example.com',
      password: 'supersecret1',
      fullName: 'Far Rider',
      acceptedTerms: true,
    });
    // ~1 degree of latitude is roughly 111km away — well outside 10km.
    await postJourney(farRider.body.token, { type: 'request', lat: HUB.lat + 1, lng: HUB.lng });

    const { estimateDemand } = await import('../src/journeys/surge.js');
    const result = estimateDemand({ lat: HUB.lat, lng: HUB.lng, departureTime: DEPARTURE });
    // Unchanged from the previous test — the far-away request must not be
    // counted.
    assert.equal(result.demandCount, 4);
  });

  test('a journey outside the +/-2h time window is not counted even if nearby', async () => {
    const laterRider = await request(app).post('/api/users/register').send({
      email: 'surge-later-rider@example.com',
      password: 'supersecret1',
      fullName: 'Later Rider',
      acceptedTerms: true,
    });
    const farFuture = new Date(Date.now() + 10 * 3600_000).toISOString(); // +10h, outside +/-2h of DEPARTURE (+3h)
    await postJourney(laterRider.body.token, { type: 'request', lat: HUB.lat, lng: HUB.lng, departureTime: farFuture });

    const { estimateDemand } = await import('../src/journeys/surge.js');
    const result = estimateDemand({ lat: HUB.lat, lng: HUB.lng, departureTime: DEPARTURE });
    assert.equal(result.demandCount, 4);
  });

  test('the configured surge_cap_multiplier correctly caps suggestedMultiplier', async () => {
    const set = await request(app)
      .post('/api/governance/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'surge_cap_multiplier', value: '1.2' });
    assert.equal(set.status, 200);

    const { estimateDemand } = await import('../src/journeys/surge.js');
    const result = estimateDemand({ lat: HUB.lat, lng: HUB.lng, departureTime: DEPARTURE });
    // demandRatio is still 4 (unchanged fixtures), so the naive scaled value
    // (1.625) would exceed the new 1.2 cap — it must be clamped to exactly 1.2.
    assert.equal(result.demandRatio, 4);
    assert.equal(result.suggestedMultiplier, 1.2);
  });

  test('GET /api/journeys/surge-suggestion requires no auth and returns the estimate', async () => {
    const res = await request(app).get('/api/journeys/surge-suggestion').query({
      lat: HUB.lat,
      lng: HUB.lng,
      departureTime: DEPARTURE,
    });
    assert.equal(res.status, 200);
    assert.ok('demandRatio' in res.body);
    assert.ok('suggested' in res.body);
    assert.ok('suggestedMultiplier' in res.body);
    assert.ok('note' in res.body);
  });

  test('GET /api/journeys/surge-suggestion validates input: missing/invalid lat, lng, departureTime -> 400', async () => {
    const missingLat = await request(app).get('/api/journeys/surge-suggestion').query({ lng: HUB.lng, departureTime: DEPARTURE });
    assert.equal(missingLat.status, 400);

    const badLat = await request(app).get('/api/journeys/surge-suggestion').query({ lat: 'not-a-number', lng: HUB.lng, departureTime: DEPARTURE });
    assert.equal(badLat.status, 400);

    const missingDeparture = await request(app).get('/api/journeys/surge-suggestion').query({ lat: HUB.lat, lng: HUB.lng });
    assert.equal(missingDeparture.status, 400);

    const badDeparture = await request(app)
      .get('/api/journeys/surge-suggestion')
      .query({ lat: HUB.lat, lng: HUB.lng, departureTime: 'not-a-date' });
    assert.equal(badDeparture.status, 400);
  });

  test('structural guarantee: neither journeys/routes.js nor journeys/surge.js ever assigns to price_per_seat', () => {
    const files = [
      path.join(__dirname, '..', 'src', 'journeys', 'routes.js'),
      path.join(__dirname, '..', 'src', 'journeys', 'surge.js'),
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      // Strip comment-only lines (the surge-guardrail comments themselves
      // mention "price_per_seat" in prose) and assert the column name never
      // appears in actual code — i.e. this endpoint and its library never
      // read-and-write, never UPDATE, never construct an object with that
      // key. The only legitimate writer of this column in the whole
      // codebase is journeys/repository.js's createJourney (the driver's
      // own explicit price at publish time), which is deliberately not in
      // this list.
      const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      assert.ok(
        !codeOnly.includes('price_per_seat'),
        `${file} must never reference the price_per_seat column outside comments`
      );
    }
  });
});
