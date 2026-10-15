import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('platform settings', () => {
  let app;
  let cleanup;
  let adminToken;
  let userToken;

  before(async () => {
    process.env.PLATFORM_COMMISSION_PCT = '7';
    ({ app, cleanup } = await buildTestApp());

    const admin = await request(app).post('/api/users/register').send({
      email: 'settings-admin@example.com',
      password: 'supersecret1',
      fullName: 'Sandra Settingsadmin',
      acceptedTerms: true,
    });

    // Promote to admin directly in the DB (there is no self-serve promotion
    // endpoint by design) and re-login so the JWT — which embeds role at
    // sign time — carries the updated role. Mirrors driverVerification.test.js.
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'settings-admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;

    const user = await request(app).post('/api/users/register').send({
      email: 'settings-user@example.com',
      password: 'supersecret1',
      fullName: 'Uri User',
      acceptedTerms: true,
    });
    userToken = user.body.token;
  });

  after(() => {
    delete process.env.PLATFORM_COMMISSION_PCT;
    cleanup();
  });

  test('getSetting/setSetting round-trip through the repository functions', async () => {
    // Uses a key outside the 6-key allowlist on purpose — this is a test of
    // the generic key/value store itself, kept independent of the
    // route-level allowlist tests below (which assert on the real 6 keys'
    // fromEnvFallback state and would otherwise be polluted by this one).
    const { getSetting, setSetting, getAllSettings } = await import('../src/governance/platformSettings.js');
    assert.equal(getSetting('__roundtrip_test_key__'), null);

    setSetting('__roundtrip_test_key__', '2.5');
    assert.equal(getSetting('__roundtrip_test_key__'), '2.5');

    // Upsert: setting it again overwrites rather than erroring on the
    // primary key conflict.
    setSetting('__roundtrip_test_key__', '3');
    assert.equal(getSetting('__roundtrip_test_key__'), '3');
    assert.equal(getAllSettings().__roundtrip_test_key__, '3');
  });

  test('the admin gate rejects a request with no token, and with a non-admin role', async () => {
    const noAuth = await request(app).get('/api/governance/platform-settings');
    assert.equal(noAuth.status, 401);

    const wrongRole = await request(app).get('/api/governance/platform-settings').set('Authorization', `Bearer ${userToken}`);
    assert.equal(wrongRole.status, 403);

    const wrongRolePost = await request(app)
      .post('/api/governance/platform-settings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: 'surge_cap_multiplier', value: '2' });
    assert.equal(wrongRolePost.status, 403);
  });

  test('GET returns all 6 keys, each flagged as using its env/hardcoded default until explicitly set', async () => {
    const res = await request(app).get('/api/governance/platform-settings').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const { settings } = res.body;
    for (const key of [
      'commission_rate_pct',
      'surge_cap_multiplier',
      'min_fare_amount',
      'min_fare_currency',
      'payout_threshold_amount',
      'payout_threshold_currency',
    ]) {
      assert.ok(key in settings, `expected ${key} in response`);
    }
    assert.equal(settings.commission_rate_pct.fromEnvFallback, true);
    assert.equal(settings.commission_rate_pct.value, '7');
    assert.equal(settings.surge_cap_multiplier.fromEnvFallback, true);
    assert.equal(settings.surge_cap_multiplier.value, '1.5');
  });

  test('POST rejects a key outside the allowlist with 400', async () => {
    const res = await request(app)
      .post('/api/governance/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'not_a_real_setting', value: '1' });
    assert.equal(res.status, 400);
  });

  test('POST persists an allowed key, which GET then reports as explicitly set', async () => {
    const post = await request(app)
      .post('/api/governance/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'min_fare_amount', value: '150' });
    assert.equal(post.status, 200);
    assert.equal(post.body.value, '150');

    const res = await request(app).get('/api/governance/platform-settings').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.body.settings.min_fare_amount.value, '150');
    assert.equal(res.body.settings.min_fare_amount.fromEnvFallback, false);
  });

  test('an explicitly-set commission rate overrides the env-var default; an unset one still falls back to it', async () => {
    const driver = await request(app).post('/api/users/register').send({
      email: 'rate-driver@example.com',
      password: 'supersecret1',
      fullName: 'Dara Ratedriver',
      acceptedTerms: true,
    });
    const driverToken = driver.body.token;

    async function payAndGetCommissionRate(riderEmail) {
      const rider = await request(app).post('/api/users/register').send({
        email: riderEmail,
        password: 'supersecret1',
        fullName: 'Rae Rider',
        acceptedTerms: true,
      });
      const riderToken = rider.body.token;

      const journeyRes = await request(app)
        .post('/api/journeys')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          type: 'offer',
          origin: { label: 'A', lat: 0, lng: 0 },
          destination: { label: 'B', lat: 1, lng: 1 },
          departureTime: new Date(Date.now() + 3600_000).toISOString(),
          seats: 5,
          pricePerSeat: 20,
          currency: 'USD',
        });

      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ journeyId: journeyRes.body.journey.id, seats: 1 });

      // 'wallet' is the zero-failure sandbox provider (see payments.test.js).
      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ bookingId: bookingRes.body.booking.id, method: 'wallet' });
      assert.equal(payRes.status, 201);
      return payRes.body.payment.commission_rate;
    }

    // Nothing stored for commission_rate_pct yet in this flow — falls back
    // to PLATFORM_COMMISSION_PCT=7 -> 0.07.
    assert.equal(await payAndGetCommissionRate('rate-rider-unset@example.com'), 0.07);

    const set = await request(app)
      .post('/api/governance/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'commission_rate_pct', value: '20' });
    assert.equal(set.status, 200);

    // Explicit override now takes precedence over the env var.
    assert.equal(await payAndGetCommissionRate('rate-rider-override@example.com'), 0.2);
  });
});
