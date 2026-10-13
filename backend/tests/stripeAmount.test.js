import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toStripeAmount } from '../src/payments/stripe.js';

describe('toStripeAmount', () => {
  test('multiplies by 100 for ordinary decimal currencies', () => {
    assert.equal(toStripeAmount(12.5, 'USD'), 1250);
    assert.equal(toStripeAmount(650, 'KES'), 65000);
    assert.equal(toStripeAmount(10, 'EUR'), 1000);
  });

  test('passes zero-decimal currencies through unmultiplied, since Stripe has no subunit for them', () => {
    // UGX is one of this app's own supported currencies (frontend/src/constants/currencies.js) —
    // a 10,000 UGX booking must charge 10,000, not 1,000,000.
    assert.equal(toStripeAmount(10000, 'UGX'), 10000);
    assert.equal(toStripeAmount(500, 'JPY'), 500);
  });

  test('is case-insensitive on the currency code', () => {
    assert.equal(toStripeAmount(10000, 'ugx'), 10000);
  });

  test('rounds to the nearest whole subunit', () => {
    assert.equal(toStripeAmount(10.005, 'USD'), 1001);
    assert.equal(toStripeAmount(10000.6, 'UGX'), 10001);
  });
});
