import { Hono } from 'hono';

export const admin = new Hono();

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genesis Admin</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 880px; margin: 40px auto; padding: 0 20px; background: #0f0f17; color: #eceaf5; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .muted { color: #9490ab; font-size: 0.85rem; }
  .gate { max-width: 360px; margin: 80px auto; text-align: center; }
  .gate input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a3750; background: #1a1826; color: #eceaf5; margin: 12px 0; font-size: 0.95rem; }
  .gate button, .refresh { padding: 10px 18px; border-radius: 8px; border: none; background: #7c6fef; color: white; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
  @media (hover: hover) and (pointer: fine) {
    .gate button:hover, .refresh:hover { background: #8f83ff; }
  }
  .error { color: #ff8080; font-size: 0.85rem; min-height: 1.2em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 24px 0; }
  .stat { background: #1a1826; border: 1px solid #2c2940; border-radius: 10px; padding: 16px 18px; }
  .stat .val { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #9490ab; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.88rem; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #2c2940; font-variant-numeric: tabular-nums; }
  th { color: #9490ab; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
  section { margin-top: 32px; }
  #app { display: none; }
  .topline { display: flex; justify-content: space-between; align-items: baseline; }
</style>
</head>
<body>
  <div class="gate" id="gate">
    <h1>Genesis Admin</h1>
    <p class="muted">Enter the admin token to view live results.</p>
    <input type="password" id="tokenInput" placeholder="Admin token" autocomplete="off">
    <div><button id="loginBtn">View dashboard</button></div>
    <p class="error" id="gateError"></p>
  </div>

  <div id="app">
    <div class="topline">
      <h1>Genesis — Live Results</h1>
      <button class="refresh" id="refreshBtn">Refresh</button>
    </div>
    <p class="muted" id="generatedAt"></p>
    <p class="muted" id="autoRefreshNote" style="margin-top:-8px;">Auto-refreshing every 7s</p>

    <div class="grid" id="statGrid"></div>

    <section>
      <h2 style="font-size:1rem;">CTA clicks by type</h2>
      <table id="ctaTable"><thead><tr><th>Label</th><th>Clicks</th></tr></thead><tbody></tbody></table>
    </section>

    <section>
      <h2 style="font-size:1rem;">Last 14 days</h2>
      <table id="dailyTable"><thead><tr><th>Day</th><th>Page views</th><th>CTA clicks</th></tr></thead><tbody></tbody></table>
    </section>

    <section>
      <h2 style="font-size:1rem;">Revenue &amp; commission</h2>
      <p class="muted" id="revenueNote" style="margin-bottom:10px;"></p>
      <div class="grid" id="revenueGrid"></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Environmental impact (estimated)</h2>
      <p class="muted" id="impactMethodology" style="margin-bottom:10px;"></p>
      <div class="grid" id="impactGrid"></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Feedback</h2>
      <table id="feedbackTable"><thead><tr><th>When</th><th>Message</th><th>Email</th><th>Page</th></tr></thead><tbody></tbody></table>
    </section>
  </div>

<script>
(function () {
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

  async function loadStats() {
    const token = getToken();
    if (!token) { showGate(''); return; }
    try {
      const res = await fetch('/api/tracking/stats', { headers: { 'x-admin-token': token } });
      if (res.status === 401) { clearToken(); showGate('Invalid token.'); return; }
      const data = await res.json();
      renderStats(data);
      gate.style.display = 'none';
      app.style.display = 'block';
      loadFeedback(token);
    } catch (err) {
      showGate('Could not reach the API: ' + err.message);
    }
  }

  async function loadFeedback(token) {
    try {
      const res = await fetch('/api/feedback/list', { headers: { 'x-admin-token': token } });
      if (!res.ok) return;
      const data = await res.json();
      const body = document.querySelector('#feedbackTable tbody');
      body.innerHTML = data.feedback.length
        ? data.feedback.map(function (f) {
            return '<tr><td>' + new Date(f.created_at).toLocaleString() + '</td><td>' + escapeHtml(f.message) +
              '</td><td>' + escapeHtml(f.email || '—') + '</td><td>' + escapeHtml(f.page || '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" style="color:#9490ab;">No feedback yet.</td></tr>';
    } catch {
      // non-fatal — the rest of the dashboard still works
    }
  }

  function showGate(msg) {
    gate.style.display = 'block';
    app.style.display = 'none';
    gateError.textContent = msg;
  }

  function renderStats(data) {
    document.getElementById('generatedAt').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleString();

    const grid = document.getElementById('statGrid');
    const stats = [
      ['Page views', data.pageViews],
      ['CTA clicks', data.ctaClicks],
      ['Signups', data.productMetrics.totalUsers],
      ['Bookings', data.productMetrics.totalBookings],
      ['Safety cases', data.productMetrics.totalSafetyCases],
    ];
    grid.innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="val">' + s[1] + '</div><div class="lbl">' + s[0] + '</div></div>';
    }).join('');

    const ctaBody = document.querySelector('#ctaTable tbody');
    ctaBody.innerHTML = data.ctaByLabel.length
      ? data.ctaByLabel.map(function (r) { return '<tr><td>' + r.label + '</td><td>' + r.n + '</td></tr>'; }).join('')
      : '<tr><td colspan="2" style="color:#9490ab;">No CTA clicks yet.</td></tr>';

    const byDay = {};
    data.dailySeries.forEach(function (r) {
      byDay[r.day] = byDay[r.day] || { page_view: 0, cta_click: 0 };
      byDay[r.day][r.event_type] = r.n;
    });
    const days = Object.keys(byDay).sort().reverse();
    const dailyBody = document.querySelector('#dailyTable tbody');
    dailyBody.innerHTML = days.length
      ? days.map(function (d) {
          return '<tr><td>' + d + '</td><td>' + byDay[d].page_view + '</td><td>' + byDay[d].cta_click + '</td></tr>';
        }).join('')
      : '<tr><td colspan="3" style="color:#9490ab;">No activity yet.</td></tr>';

    const revenue = data.revenue || {};
    document.getElementById('revenueNote').textContent = revenue.note || '';
    const byCurrency = revenue.byCurrency || [];
    // Journeys can be posted in any currency, so gross/commission are never
    // summed across currencies into one figure — one stat pair per currency.
    document.getElementById('revenueGrid').innerHTML = byCurrency.length
      ? byCurrency.map(function (r) {
          return (
            '<div class="stat"><div class="val">' + escapeHtml(r.currency) + ' ' + r.grossCaptured + '</div><div class="lbl">Gross captured (' + escapeHtml(r.currency) + ')</div></div>' +
            '<div class="stat"><div class="val">' + escapeHtml(r.currency) + ' ' + r.commissionCollected + '</div><div class="lbl">Commission collected (' + escapeHtml(r.currency) + ')</div></div>'
          );
        }).join('')
      : '<div class="stat"><div class="val">—</div><div class="lbl">No captured payments yet</div></div>';

    const impact = data.environmentalImpact || {};
    document.getElementById('impactMethodology').textContent = impact.methodology || '';
    const impactStats = [
      ['Shared journeys completed', impact.sharedJourneysCompleted || 0],
      ['Passenger seats utilised', impact.seatsUtilised || 0],
      ['Est. vehicle-km avoided', impact.vehicleKmAvoided || 0],
      ['Est. CO2e avoided (kg)', impact.co2eKgAvoided || 0],
      ['Est. fuel avoided (L)', impact.fuelLitersAvoided || 0],
      ['EV/hybrid offers', impact.cleanVehiclePct === null || impact.cleanVehiclePct === undefined ? 'n/a' : impact.cleanVehiclePct + '%'],
    ];
    document.getElementById('impactGrid').innerHTML = impactStats.map(function (s) {
      return '<div class="stat"><div class="val">' + s[1] + '</div><div class="lbl">' + s[0] + '</div></div>';
    }).join('');
  }

  document.getElementById('loginBtn').addEventListener('click', function () {
    const t = tokenInput.value.trim();
    if (!t) return;
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
})();
</script>
</body>
</html>`;

admin.get('/', (c) => c.html(PAGE));
