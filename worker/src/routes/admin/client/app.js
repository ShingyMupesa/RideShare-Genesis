// Shared client JS: token get/set/clear, escapeHtml, the ISO-8859-1
// hasNonLatin1Char check, the showScreen() tab router, and the top-level
// wiring (login, refresh, auto-refresh) that was previously inline in
// admin.js. Concatenated first inside the page's single IIFE so that the
// screens' script() blocks (which define loadStats/loadDriverVerification,
// referenced below) can rely on function-declaration hoisting.

export function script() {
  return `
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');
  const tokenInput = document.getElementById('tokenInput');
  const gateError = document.getElementById('gateError');

  function getToken() { return sessionStorage.getItem('genesis_admin_token'); }
  function setToken(t) { sessionStorage.setItem('genesis_admin_token', t); }
  function clearToken() { sessionStorage.removeItem('genesis_admin_token'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // HTTP header values can only contain ISO-8859-1 (Latin-1) characters —
  // a token pasted through something that "smartens" punctuation (curly
  // quotes, an em dash, a non-breaking space, an emoji) otherwise crashes
  // fetch() itself with an opaque "non ISO-8859-1 code point" TypeError
  // before any request is even sent. Catch it here with a message that
  // actually names the problem.
  function hasNonLatin1Char(s) {
    const str = String(s == null ? '' : s);
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 255) return true;
    }
    return false;
  }

  function showGate(msg) {
    gate.style.display = 'block';
    app.style.display = 'none';
    gateError.textContent = msg;
  }

  const SCREEN_TITLES = { dashboard: 'Dashboard', driverVerification: 'Driver Verification', disputes: 'Disputes', liveMap: 'Live Map', config: 'Config' };

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('active', el.id === 'screen-' + name);
    });
    document.querySelectorAll('.sb-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-screen') === name);
    });
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = SCREEN_TITLES[name] || name;
  }

  document.querySelectorAll('.sb-item').forEach(function (el) {
    el.addEventListener('click', function () { showScreen(el.getAttribute('data-screen')); });
  });

  document.getElementById('loginBtn').addEventListener('click', function () {
    const t = tokenInput.value.trim();
    if (!t) return;
    if (hasNonLatin1Char(t)) {
      showGate('That token contains a character your browser can’t send as a header (e.g. a smart quote, em dash, or emoji) — re-copy it from its plain-text source, or generate a new one with openssl rand -hex 32.');
      return;
    }
    setToken(t);
    loadStats();
  });
  tokenInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });
  document.getElementById('refreshBtn').addEventListener('click', loadStats);

  // Auto-refresh every 7s (5-10s range) while the dashboard is unlocked and
  // the tab is actually visible — no point burning requests (and the admin
  // rate limit) refreshing a backgrounded tab nobody is looking at.
  setInterval(function () {
    if (getToken() && document.visibilityState === 'visible') loadStats();
  }, 7000);

  loadStats();
`;
}
