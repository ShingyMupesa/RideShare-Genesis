// First-touch attribution: where did this visitor first come from?
// Stored only in this browser and sent once, with signup. No personal data.
const KEY = 'genesis_attr';
const REF_RE = /^[A-Za-z0-9]{4,12}$/;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function write(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // storage unavailable: attribution is best-effort
  }
}

export function captureAttribution(location = window.location) {
  const params = new URLSearchParams(location.search);
  const current = read() || {};
  const ref = params.get('ref');
  const next = { ...current };
  if (!current.landing) next.landing = location.pathname;
  if (!current.source && params.get('utm_source')) {
    next.source = params.get('utm_source');
    next.medium = params.get('utm_medium') || null;
    next.campaign = params.get('utm_campaign') || null;
  }
  // A referral code is first-touch too: the first person who invited you
  // gets the credit.
  if (ref && REF_RE.test(ref) && !current.ref) next.ref = ref.toUpperCase();
  if (!current.ts) next.ts = Date.now();
  write(next);
  return next;
}

export function setReferral(code) {
  if (!code || !REF_RE.test(code)) return;
  const current = read() || {};
  if (!current.ref) write({ ...current, ref: code.toUpperCase(), source: current.source || 'referral' });
}

export function getAttribution() {
  return read() || {};
}

function visitorId() {
  try {
    let id = localStorage.getItem('genesis_vid');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('genesis_vid', id);
    }
    return id;
  } catch {
    return null;
  }
}

export function trackEvent(eventType, page, label) {
  try {
    fetch('/api/tracking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType, page, label, visitorId: visitorId() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // tracking must never break the page
  }
}
