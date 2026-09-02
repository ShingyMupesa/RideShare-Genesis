import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { normalizeKenyanPhone, initiateStkPush, queryStkPushStatus, parseCallbackMetadata } from '../src/payments/mpesa.js';

const TEST_CONFIG = { consumerKey: 'ck', consumerSecret: 'cs', shortcode: '174379', passkey: 'pk', environment: 'sandbox' };

function withMockedFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  // Promise.resolve() rather than calling fn() directly — supertest's
  // Test object is thenable but doesn't implement the full Promise
  // interface (no .finally()), which `fn` sometimes returns directly here.
  return Promise.resolve(fn()).finally(() => {
    global.fetch = original;
  });
}

describe('mpesa.js — Daraja client', () => {
  test('normalizes the common ways a Kenyan number gets typed', () => {
    assert.equal(normalizeKenyanPhone('0712345678'), '254712345678');
    assert.equal(normalizeKenyanPhone('712345678'), '254712345678');
    assert.equal(normalizeKenyanPhone('+254712345678'), '254712345678');
    assert.equal(normalizeKenyanPhone('254 712 345 678'), '254712345678');
    assert.equal(normalizeKenyanPhone('0112345678'), '254112345678'); // newer Safaricom 01xx range
  });

  test('rejects numbers that are not plausibly Kenyan mobile numbers', () => {
    assert.equal(normalizeKenyanPhone('12345'), null);
    assert.equal(normalizeKenyanPhone('447911123456'), null); // UK number
    assert.equal(normalizeKenyanPhone(''), null);
    assert.equal(normalizeKenyanPhone(undefined), null);
  });

  test('initiateStkPush sends a correctly-shaped request and returns the checkout id', async () => {
    let stkPushBody;
    await withMockedFetch(async (url, opts) => {
      if (String(url).includes('/oauth/v1/generate')) {
        assert.ok(opts.headers.Authorization.startsWith('Basic '));
        return { ok: true, json: async () => ({ access_token: 'test-access-token' }) };
      }
      if (String(url).includes('/stkpush/v1/processrequest')) {
        stkPushBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            ResponseCode: '0',
            CheckoutRequestID: 'ws_CO_test_123',
            MerchantRequestID: 'mr_test_123',
            CustomerMessage: 'Success. Request accepted for processing',
          }),
        };
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }, async () => {
      const result = await initiateStkPush({
        phone: '0712345678',
        amount: 15.9,
        accountReference: 'bkg_abc',
        transactionDesc: 'Genesis ride',
        callbackUrl: 'https://example.com/callback',
        config: TEST_CONFIG,
      });
      assert.equal(result.checkoutRequestId, 'ws_CO_test_123');
      assert.equal(result.customerMessage, 'Success. Request accepted for processing');
    });

    assert.equal(stkPushBody.BusinessShortCode, '174379');
    assert.equal(stkPushBody.TransactionType, 'CustomerPayBillOnline');
    assert.equal(stkPushBody.PartyA, '254712345678');
    assert.equal(stkPushBody.PhoneNumber, '254712345678');
    assert.equal(stkPushBody.Amount, 16); // rounded to the nearest whole shilling
    assert.match(stkPushBody.Timestamp, /^\d{14}$/);
    // Password is base64(shortcode + passkey + timestamp) — verifiable by decoding it.
    const decoded = Buffer.from(stkPushBody.Password, 'base64').toString('utf8');
    assert.equal(decoded, `174379pk${stkPushBody.Timestamp}`);
  });

  test('initiateStkPush surfaces a Safaricom-reported failure', async () => {
    await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ ResponseCode: '1', ResponseDescription: 'Invalid shortcode' }) };
    }, async () => {
      await assert.rejects(
        () => initiateStkPush({ phone: '0712345678', amount: 10, accountReference: 'x', callbackUrl: 'https://x', config: TEST_CONFIG }),
        /Invalid shortcode/
      );
    });
  });

  test('initiateStkPush rejects an unrecognisable phone number before ever calling Safaricom', async () => {
    let fetchCalled = false;
    await withMockedFetch(async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    }, async () => {
      await assert.rejects(
        () => initiateStkPush({ phone: 'not-a-phone', amount: 10, accountReference: 'x', callbackUrl: 'https://x', config: TEST_CONFIG })
      );
    });
    assert.equal(fetchCalled, false);
  });

  test('queryStkPushStatus treats a Safaricom "still processing" error as pending, not failure', async () => {
    await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' }) };
    }, async () => {
      const result = await queryStkPushStatus({ checkoutRequestId: 'ws_CO_x', config: TEST_CONFIG });
      assert.equal(result.pending, true);
    });
  });

  test('queryStkPushStatus reports a definitive success or failure once Safaricom has one', async () => {
    await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ ResultCode: 0, ResultDesc: 'The service request is processed successfully.' }) };
    }, async () => {
      const result = await queryStkPushStatus({ checkoutRequestId: 'ws_CO_x', config: TEST_CONFIG });
      assert.equal(result.pending, false);
      assert.equal(result.success, true);
    });
  });

  test('parseCallbackMetadata flattens the Name/Value item array Safaricom sends', () => {
    const meta = parseCallbackMetadata([
      { Name: 'Amount', Value: 15 },
      { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
      { Name: 'TransactionDate', Value: 20260902102115 },
      { Name: 'PhoneNumber', Value: 254712345678 },
    ]);
    assert.deepEqual(meta, { amount: 15, mpesaReceiptNumber: 'NLJ7RT61SV', transactionDate: 20260902102115, phoneNumber: 254712345678 });
  });
});

describe('M-Pesa payment routes', () => {
  let app;
  let cleanup;
  let riderToken;
  let riderId;
  let strangerToken;
  let kesBookingId;
  let Payments;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
    process.env.MPESA_CONSUMER_KEY = 'ck';
    process.env.MPESA_CONSUMER_SECRET = 'cs';
    process.env.MPESA_SHORTCODE = '174379';
    process.env.MPESA_PASSKEY = 'pk';
    process.env.MPESA_ENV = 'sandbox';

    // Imported dynamically, after buildTestApp() has already set
    // DATABASE_FILE and triggered the first import of the db connection
    // module — this then resolves to that same cached, correctly-pathed
    // singleton rather than one pointed at the default dev database.
    Payments = await import('../src/payments/repository.js');

    const driver = await request(app).post('/api/users/register').send({
      email: 'mpesa-driver@example.com',
      password: 'supersecret1',
      fullName: 'Mary Driver',
      acceptedTerms: true,
    });
    const rider = await request(app).post('/api/users/register').send({
      email: 'mpesa-rider@example.com',
      password: 'supersecret1',
      fullName: 'Riziki Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;
    riderId = rider.body.user.id;

    const stranger = await request(app).post('/api/users/register').send({
      email: 'mpesa-stranger@example.com',
      password: 'supersecret1',
      fullName: 'Sam Stranger',
      acceptedTerms: true,
    });
    strangerToken = stranger.body.token;

    const journey = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driver.body.token}`)
      .send({
        type: 'offer',
        origin: { label: 'Nairobi CBD', lat: -1.2864, lng: 36.8172 },
        destination: { label: 'JKIA', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 300,
        currency: 'KES',
      });

    const booking = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId: journey.body.journey.id, seats: 1 });
    kesBookingId = booking.body.booking.id;
  });

  after(() => {
    delete process.env.MPESA_CONSUMER_KEY;
    delete process.env.MPESA_CONSUMER_SECRET;
    delete process.env.MPESA_SHORTCODE;
    delete process.env.MPESA_PASSKEY;
    delete process.env.MPESA_ENV;
    cleanup();
  });

  test('reports mpesa as enabled once configured', async () => {
    const res = await request(app).get('/api/payments/methods');
    assert.equal(res.body.mpesa.enabled, true);
  });

  test('/mpesa/stk-push returns 400 when M-Pesa is not configured', async () => {
    const saved = process.env.MPESA_CONSUMER_KEY;
    delete process.env.MPESA_CONSUMER_KEY;
    try {
      const res = await request(app)
        .post('/api/payments/mpesa/stk-push')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ bookingId: kesBookingId, phone: '0712345678' });
      assert.equal(res.status, 400);
    } finally {
      process.env.MPESA_CONSUMER_KEY = saved;
    }
  });

  test('only the passenger can initiate M-Pesa payment for their booking', async () => {
    const res = await request(app)
      .post('/api/payments/mpesa/stk-push')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ bookingId: kesBookingId, phone: '0712345678' });
    assert.equal(res.status, 403);
  });

  test('rejects a non-KES booking', async () => {
    // Reuses the app's own driver/rider infra isn't needed — just confirm
    // the currency guard fires before any Safaricom call would be made.
    const driver2 = await request(app).post('/api/users/register').send({
      email: 'mpesa-driver2@example.com',
      password: 'supersecret1',
      fullName: 'Mo Driver2',
      acceptedTerms: true,
    });
    const journey = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driver2.body.token}`)
      .send({
        type: 'offer',
        origin: { label: 'A', lat: 0, lng: 0 },
        destination: { label: 'B', lat: 1, lng: 1 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 1,
        pricePerSeat: 10,
        currency: 'USD',
      });
    const booking = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId: journey.body.journey.id, seats: 1 });

    const res = await request(app)
      .post('/api/payments/mpesa/stk-push')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ bookingId: booking.body.booking.id, phone: '0712345678' });
    assert.equal(res.status, 400);
  });

  let paymentId;
  let checkoutRequestId = 'ws_CO_route_test_1';

  test('a valid request initiates the STK push and records a pending payment', async () => {
    const res = await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return {
        ok: true,
        json: async () => ({ ResponseCode: '0', CheckoutRequestID: checkoutRequestId, MerchantRequestID: 'mr_1', CustomerMessage: 'Success. Request accepted for processing' }),
      };
    }, () =>
      request(app)
        .post('/api/payments/mpesa/stk-push')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ bookingId: kesBookingId, phone: '0712345678' })
    );

    assert.equal(res.status, 201);
    assert.ok(res.body.paymentId);
    assert.equal(res.body.customerMessage, 'Success. Request accepted for processing');
    paymentId = res.body.paymentId;

    const paymentsRes = await request(app).get(`/api/payments/booking/${kesBookingId}`).set('Authorization', `Bearer ${riderToken}`);
    const payment = paymentsRes.body.payments.find((p) => p.id === paymentId);
    assert.equal(payment.status, 'PENDING');
    assert.equal(payment.method, 'mpesa');
    assert.equal(payment.reference, checkoutRequestId);
  });

  test('the callback captures the payment on a successful result, keyed by paymentId + matching CheckoutRequestID', async () => {
    const res = await request(app)
      .post(`/api/payments/mpesa/callback?paymentId=${paymentId}`)
      .send({
        Body: {
          stkCallback: {
            MerchantRequestID: 'mr_1',
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 300 },
                { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
                { Name: 'TransactionDate', Value: 20260902102115 },
                { Name: 'PhoneNumber', Value: 254712345678 },
              ],
            },
          },
        },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ResultCode, 0);

    const paymentsRes = await request(app).get(`/api/payments/booking/${kesBookingId}`).set('Authorization', `Bearer ${riderToken}`);
    const payment = paymentsRes.body.payments.find((p) => p.id === paymentId);
    assert.equal(payment.status, 'CAPTURED');
  });

  test('a callback with a mismatched CheckoutRequestID is acknowledged but never applied', async () => {
    const res = await request(app)
      .post(`/api/payments/mpesa/callback?paymentId=${paymentId}`)
      .send({
        Body: {
          stkCallback: { CheckoutRequestID: 'not-the-real-one', ResultCode: 0, ResultDesc: 'ok' },
        },
      });
    assert.equal(res.status, 200); // Safaricom's expected ack shape either way

    // Still CAPTURED from the previous (legitimate) callback — a forged one
    // referencing the wrong CheckoutRequestID must never flip it back.
    const paymentsRes = await request(app).get(`/api/payments/booking/${kesBookingId}`).set('Authorization', `Bearer ${riderToken}`);
    const payment = paymentsRes.body.payments.find((p) => p.id === paymentId);
    assert.equal(payment.status, 'CAPTURED');
  });

  test('a failed STK push result marks the payment FAILED', async () => {
    // Seeded directly via the repository (bypassing the rate-limited
    // stk-push route, which is already exercised end-to-end above) — this
    // test is only about what /callback does with a non-zero ResultCode.
    const failedCheckoutId = 'ws_CO_route_test_failed';
    const seeded = Payments.createPayment({ bookingId: kesBookingId, payerId: riderId, method: 'mpesa', amount: 300, currency: 'KES', commissionRate: 0 });
    Payments.updatePaymentStatus(seeded.id, 'PENDING', failedCheckoutId);

    await request(app)
      .post(`/api/payments/mpesa/callback?paymentId=${seeded.id}`)
      .send({
        Body: { stkCallback: { CheckoutRequestID: failedCheckoutId, ResultCode: 1032, ResultDesc: 'Request cancelled by user' } },
      });

    const paymentsRes = await request(app).get(`/api/payments/booking/${kesBookingId}`).set('Authorization', `Bearer ${riderToken}`);
    const payment = paymentsRes.body.payments.find((p) => p.id === seeded.id);
    assert.equal(payment.status, 'FAILED');
  });

  test('the status endpoint polls Safaricom directly when the callback has not arrived yet', async () => {
    // Seeded directly for the same reason as above — this test is about
    // the /status polling fallback, not the stk-push route itself.
    const pollCheckoutId = 'ws_CO_route_test_poll';
    const seeded = Payments.createPayment({ bookingId: kesBookingId, payerId: riderId, method: 'mpesa', amount: 300, currency: 'KES', commissionRate: 0 });
    Payments.updatePaymentStatus(seeded.id, 'PENDING', pollCheckoutId);
    const pollPaymentId = seeded.id;

    // First poll: Safaricom says still processing — stays PENDING.
    await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ errorCode: '500.001.1001', errorMessage: 'processing' }) };
    }, async () => {
      const res = await request(app).get(`/api/payments/mpesa/${pollPaymentId}/status`).set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.body.payment.status, 'PENDING');
    });

    // Second poll: Safaricom now has a definitive success — becomes CAPTURED.
    await withMockedFetch(async (url) => {
      if (String(url).includes('/oauth/v1/generate')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ ResultCode: 0, ResultDesc: 'The service request is processed successfully.' }) };
    }, async () => {
      const res = await request(app).get(`/api/payments/mpesa/${pollPaymentId}/status`).set('Authorization', `Bearer ${riderToken}`);
      assert.equal(res.body.payment.status, 'CAPTURED');
    });

    // A stranger can't poll someone else's payment status.
    const forbidden = await request(app).get(`/api/payments/mpesa/${pollPaymentId}/status`).set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(forbidden.status, 403);
  });
});
