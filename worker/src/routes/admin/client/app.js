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
  var adminPerms = null;

  // Which permission area each sidebar screen needs (mirrors lib/adminTeam.js).
  const SCREEN_AREAS = {
    dashboard: 'analytics', analytics: 'analytics', uxMetrics: 'analytics', liveMap: 'analytics', systemLogs: 'analytics', goToMarket: 'analytics',
    driverVerification: 'drivers', disputes: 'support',
    users: 'users', drivers: 'users', passengers: 'users', rides: 'users',
    payments: 'finance', monetisation: 'finance', adSlots: 'finance', insurancePartners: 'finance',
    config: 'config', adminTeam: '__team',
  };
  function canSee(screen) {
    if (!adminPerms) return false;
    const area = SCREEN_AREAS[screen];
    if (area === '__team') return !!adminPerms.manageTeam;
    return !!(adminPerms.areas && adminPerms.areas[area]);
  }
  function canWrite(area) { return !!(adminPerms && adminPerms.areas && adminPerms.areas[area] === 'write'); }
  function applyPermissions() {
    document.querySelectorAll('.sb-item').forEach(function (el) {
      el.style.display = canSee(el.getAttribute('data-screen')) ? '' : 'none';
    });
    const who = document.getElementById('whoami');
    if (who && adminPerms) who.textContent = (adminPerms.name ? adminPerms.name + ' · ' : '') + (adminPerms.roleLabel || adminPerms.role);
    const active = document.querySelector('.screen.active');
    const activeName = active ? active.id.replace('screen-', '') : 'dashboard';
    if (!canSee(activeName)) {
      const first = Object.keys(SCREEN_AREAS).find(canSee);
      if (first) showScreen(first);
    }
  }
  const gateError = document.getElementById('gateError');

  function getToken() { return sessionStorage.getItem('genesis_admin_token'); }
  function setToken(t) { sessionStorage.setItem('genesis_admin_token', t); }
  function clearToken() { sessionStorage.removeItem('genesis_admin_token'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Shared money display across every screen — never used to sum amounts
  // across different currencies, only to format one already-grouped figure.
  // Thousands separator + fixed 2 decimals, e.g. "KES 1,234.50".
  function formatMoney(currency, amount) {
    const n = Number(amount);
    const formatted = Number.isFinite(n)
      ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(amount == null ? '0.00' : amount);
    return escapeHtml(currency || '') + ' ' + formatted;
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

  const SCREEN_TITLES = {
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    uxMetrics: 'UX Metrics',
    driverVerification: 'Driver Verification',
    disputes: 'Disputes',
    liveMap: 'Live Map',
    users: 'Users',
    drivers: 'Drivers',
    passengers: 'Passengers',
    rides: 'Rides',
    payments: 'Payments',
    monetisation: 'Subscriptions',
    adSlots: 'Ad Slots',
    insurancePartners: 'Insurance Partners',
    systemLogs: 'System Logs',
    goToMarket: 'Go-to-market',
    config: 'Config',
    adminTeam: 'Admin Team',
  };

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

  document.getElementById('loginBtn').addEventListener('click', async function () {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    if (!email || !password) { showGate('Enter your email and password.'); return; }
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin-team/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) { showGate((data.error && data.error.message) || 'Sign-in failed.'); return; }
      document.getElementById('adminPassword').value = '';
      setToken(data.token);
      loadStats();
    } catch (err) {
      showGate('Could not reach the API: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('adminPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearToken();
    adminPerms = null;
    showGate('Signed out.');
  });
  window.addEventListener('hashchange', function () {
    const h = location.hash.replace('#', '');
    if (h && canSee(h)) showScreen(h);
  });

  document.getElementById('tokenLoginBtn').addEventListener('click', function () {
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
    if (e.key === 'Enter') document.getElementById('tokenLoginBtn').click();
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
