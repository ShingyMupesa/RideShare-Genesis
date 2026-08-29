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

export const api = {
  // Auth / users
  register: (payload) => request('/users/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/users/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/users/me'),
  forgotPassword: (email) => request('/users/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, newPassword) =>
    request('/users/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  updateProfile: (payload) => request('/users/me/profile', { method: 'PATCH', body: payload }),

  // Journeys
  createJourney: (payload) => request('/journeys', { method: 'POST', body: payload }),
  listJourneys: (query = '') => request(`/journeys${query}`, { auth: false }),
  getJourney: (id) => request(`/journeys/${id}`, { auth: false }),
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

  // Messaging
  listMessages: (bookingId) => request(`/messages/booking/${bookingId}`),
  sendMessage: (bookingId, body) => request(`/messages/booking/${bookingId}`, { method: 'POST', body: { body } }),

  // Safety
  triggerSOS: (payload) => request('/safety/sos', { method: 'POST', body: payload }),
  fileSafetyReport: (payload) => request('/safety/report', { method: 'POST', body: payload }),
  mySafetyCases: () => request('/safety/mine'),
  trustedContact: () => request('/safety/trusted-contact'),

  // AI Gateway
  askAssistant: (message) => request('/ai/assistant', { method: 'POST', body: { message }, auth: false }),
  aiStatus: () => request('/ai/status', { auth: false }),
};

export { ApiError };
