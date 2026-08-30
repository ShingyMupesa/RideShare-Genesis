// Thin wrapper over Stripe's REST API via fetch — no SDK dependency, so the
// same code works unchanged in the Workers runtime and the Node backend.
const STRIPE_API = 'https://api.stripe.com/v1';

// Stripe's "amount" is normally the currency's smallest unit (cents), but a
// subset of currencies have no subunit at all and must be passed as the
// whole-number major unit directly — multiplying those by 100 overcharges
// by 100x. UGX (one of this app's own supported currencies) is one of
// them, so this isn't a hypothetical edge case. Full list per Stripe's
// documented zero-decimal currencies.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

function toStripeAmount(amount, currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

function formEncode(data) {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function stripeRequest(path, { method = 'GET', body, secretKey } = {}) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? formEncode(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Stripe request failed');
    err.stripeError = data?.error;
    throw err;
  }
  return data;
}

/**
 * Creates a Stripe PaymentIntent for the given amount (in the booking's own
 * currency's major unit, e.g. 12.50 USD — converted to Stripe's expected
 * subunit via toStripeAmount(), which is a no-op for zero-decimal
 * currencies like UGX. The card itself is never touched by our servers:
 * the frontend collects it directly into Stripe via Elements and confirms
 * this intent client-side.
 */
export async function createPaymentIntent({ amount, currency, bookingId, secretKey }) {
  return stripeRequest('/payment_intents', {
    method: 'POST',
    secretKey,
    body: {
      amount: toStripeAmount(amount, currency),
      currency: currency.toLowerCase(),
      'metadata[bookingId]': bookingId,
      'automatic_payment_methods[enabled]': 'true',
    },
  });
}

/**
 * Re-fetches a PaymentIntent directly from Stripe so its status is always
 * verified server-side — a client reporting "success" is never trusted on
 * its own, since that report could be spoofed or the tab could have closed
 * mid-flow.
 */
export async function retrievePaymentIntent(id, { secretKey }) {
  return stripeRequest(`/payment_intents/${id}`, { method: 'GET', secretKey });
}
