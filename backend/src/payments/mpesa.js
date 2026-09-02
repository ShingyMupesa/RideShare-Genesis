// Thin wrapper over Safaricom's Daraja API (M-Pesa STK Push) via fetch —
// no SDK dependency, so the same code works unchanged in the Node backend
// and the Workers runtime (see worker/src/lib/mpesa.js, a deliberate
// duplicate — same reasoning as webpush.js/stripe.js elsewhere in this
// app). M-Pesa only ever moves Kenyan shillings; callers are responsible
// for only calling this when a booking's currency is KES.

const BASE_URLS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

function base64Encode(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  return btoa(str);
}

// Daraja wants the current time in Kenya (always UTC+3, no DST) regardless
// of what timezone this process happens to be running in.
function nairobiTimestamp(date = new Date()) {
  const nairobi = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    nairobi.getUTCFullYear().toString() +
    pad(nairobi.getUTCMonth() + 1) +
    pad(nairobi.getUTCDate()) +
    pad(nairobi.getUTCHours()) +
    pad(nairobi.getUTCMinutes()) +
    pad(nairobi.getUTCSeconds())
  );
}

// Accepts the common ways a Kenyan number gets typed (0712345678,
// 712345678, +254712345678, 254712345678, with stray spaces/dashes) and
// normalizes to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja requires.
// Returns null rather than throwing — callers turn that into a 400.
export function normalizeKenyanPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  let normalized;
  if (digits.startsWith('254') && digits.length === 12) normalized = digits;
  else if (digits.startsWith('0') && digits.length === 10) normalized = `254${digits.slice(1)}`;
  else if (digits.length === 9) normalized = `254${digits}`;
  else return null;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

async function getAccessToken({ consumerKey, consumerSecret, environment }) {
  const baseUrl = BASE_URLS[environment] || BASE_URLS.sandbox;
  const auth = base64Encode(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data?.errorMessage || 'Could not authenticate with M-Pesa');
  }
  return data.access_token;
}

/**
 * Initiates an STK Push — the "enter your M-Pesa PIN" prompt Safaricom
 * sends straight to the payer's phone. Resolves once Safaricom has
 * *accepted the request*, not once the customer has actually paid; the
 * real result arrives later via the callback URL (or a status poll).
 */
export async function initiateStkPush({ phone, amount, accountReference, transactionDesc, callbackUrl, config }) {
  const { consumerKey, consumerSecret, shortcode, passkey, environment = 'sandbox' } = config || {};
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
    throw new Error('M-Pesa is not configured on this server');
  }
  const normalizedPhone = normalizeKenyanPhone(phone);
  if (!normalizedPhone) throw new Error('Enter a valid Kenyan phone number (e.g. 07XXXXXXXX)');
  if (!Number.isFinite(amount) || amount < 1) throw new Error('Amount must be at least KES 1');

  const baseUrl = BASE_URLS[environment] || BASE_URLS.sandbox;
  const accessToken = await getAccessToken({ consumerKey, consumerSecret, environment });
  const timestamp = nairobiTimestamp();
  const password = base64Encode(`${shortcode}${passkey}${timestamp}`);

  const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // M-Pesa only accepts whole-shilling amounts, no cents
      PartyA: normalizedPhone,
      PartyB: shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: String(accountReference).slice(0, 12), // Daraja's own limit
      TransactionDesc: String(transactionDesc || 'RideShare Genesis').slice(0, 13), // Daraja's own limit
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data?.errorMessage || data?.ResponseDescription || 'Could not start the M-Pesa payment');
  }
  return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID, customerMessage: data.CustomerMessage };
}

/**
 * Polls Safaricom directly for the outcome of a previously-initiated STK
 * Push — used as a fallback when the async callback is slow or (common in
 * sandbox testing) never arrives at all.
 */
export async function queryStkPushStatus({ checkoutRequestId, config }) {
  const { consumerKey, consumerSecret, shortcode, passkey, environment = 'sandbox' } = config || {};
  const baseUrl = BASE_URLS[environment] || BASE_URLS.sandbox;
  const accessToken = await getAccessToken({ consumerKey, consumerSecret, environment });
  const timestamp = nairobiTimestamp();
  const password = base64Encode(`${shortcode}${passkey}${timestamp}`);

  const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
  });
  const data = await res.json().catch(() => ({}));
  // Safaricom answers HTTP 200 with an error-shaped body (errorCode
  // "500.001.1001") while the push is still awaiting the customer's PIN —
  // that's not a failure, it just means "ask again shortly".
  if (data.errorCode) return { pending: true };
  return {
    pending: false,
    success: String(data.ResultCode) === '0',
    resultCode: data.ResultCode,
    resultDesc: data.ResultDesc,
  };
}

// The callback body's CallbackMetadata.Item is an array of {Name, Value}
// pairs rather than a plain object — this flattens it.
export function parseCallbackMetadata(items) {
  const map = {};
  for (const item of items || []) {
    if (item?.Name) map[item.Name] = item.Value;
  }
  return {
    amount: map.Amount,
    mpesaReceiptNumber: map.MpesaReceiptNumber,
    transactionDate: map.TransactionDate,
    phoneNumber: map.PhoneNumber,
  };
}
