const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'genesis_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'UNKNOWN', err.message || res.statusText, err.details);
  }
  return data;
}

async function requestBlob(path) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'FETCH_FAILED', 'Could not load this image');
  return res.blob();
}

export const api = {
  // Auth / users
  register: (payload) => request('/users/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/users/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/users/me'),
  sendFeedback: (payload) => request('/feedback', { method: 'POST', body: payload }),
  forgotPassword: (email) => request('/users/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, newPassword) =>
    request('/users/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  updateProfile: (payload) => request('/users/me/profile', { method: 'PATCH', body: payload }),

  // Journeys
  createJourney: (payload) => request('/journeys', { method: 'POST', body: payload }),
  // `mine=true` requires the auth token to resolve the owner filter, and
  // plain browsing is unaffected either way (no token just means no
  // Authorization header is attached) — so this always allows auth rather
  // than hardcoding it off.
  listJourneys: (query = '') => request(`/journeys${query}`),
  // A `request`-type journey is private to its owner (see backend), so this
  // must be allowed to send the token when one exists — otherwise an owner
  // viewing their own request journey gets a 403 just like an anonymous
  // visitor would.
  getJourney: (id) => request(`/journeys/${id}`),
  cancelJourney: (id) => request(`/journeys/${id}/cancel`, { method: 'POST' }),

  // Matching
  refreshMatches: (journeyId) => request(`/matching/journeys/${journeyId}/refresh`, { method: 'POST' }),
  getMatch: (id) => request(`/matching/${id}`),
  getMatchExplanation: (id) => request(`/matching/${id}/explanation`),
  acceptMatch: (id) => request(`/matching/${id}/accept`, { method: 'POST' }),
  dismissMatch: (id) => request(`/matching/${id}/dismiss`, { method: 'POST' }),

  // Bookings
  createBooking: (payload) => request('/bookings', { method: 'POST', body: payload }),
  myBookings: () => request('/bookings/mine'),
  getBooking: (id) => request(`/bookings/${id}`),
  requestBooking: (id) => request(`/bookings/${id}/request`, { method: 'POST' }),
  confirmBooking: (id) => request(`/bookings/${id}/confirm`, { method: 'POST' }),
  startBooking: (id) => request(`/bookings/${id}/start`, { method: 'POST' }),
  completeBooking: (id) => request(`/bookings/${id}/complete`, { method: 'POST' }),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  // Payments
  paymentMethods: () => request('/payments/methods', { auth: false }),
  pay: (payload) => request('/payments', { method: 'POST', body: payload }),
  paymentsForBooking: (bookingId) => request(`/payments/booking/${bookingId}`),
  createStripeIntent: (bookingId) => request('/payments/stripe/intent', { method: 'POST', body: { bookingId } }),
  confirmStripePayment: (paymentId) => request(`/payments/stripe/${paymentId}/confirm`, { method: 'POST' }),
  mpesaStkPush: (bookingId, phone) => request('/payments/mpesa/stk-push', { method: 'POST', body: { bookingId, phone } }),
  mpesaPaymentStatus: (paymentId) => request(`/payments/mpesa/${paymentId}/status`),

  // Messaging
  listMessages: (bookingId) => request(`/messages/booking/${bookingId}`),
  sendMessage: (bookingId, body) => request(`/messages/booking/${bookingId}`, { method: 'POST', body: { body } }),

  // Safety
  triggerSOS: (payload) => request('/safety/sos', { method: 'POST', body: payload }),
  fileSafetyReport: (payload) => request('/safety/report', { method: 'POST', body: payload }),
  mySafetyCases: () => request('/safety/mine'),
  trustedContact: () => request('/safety/trusted-contact'),

  // AI Gateway
  // Sending the token when present lets the assistant enrich its answer
  // with the user's own Decision DNA weights; it stays optional server-side.
  askAssistant: (message) => request('/ai/assistant', { method: 'POST', body: { message } }),
  aiStatus: () => request('/ai/status', { auth: false }),

  // Push notifications
  getVapidPublicKey: () => request('/push/vapid-public-key', { auth: false }),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: subscription }),
  unsubscribePush: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),

  // Driver verification
  driverVerificationSettings: () => request('/driver-verification/settings', { auth: false }),
  myDriverVerification: () => request('/driver-verification/me'),
  submitDriverVerification: (payload) => request('/driver-verification', { method: 'POST', body: payload }),
  driverVerificationPhotoBlob: (submissionId, which) => requestBlob(`/driver-verification/${submissionId}/photo/${which}`),
};

export { ApiError };
