// Drivers screen: thin — reuses GET /api/admin/users?type=driver and the
// renderUserRows() helper defined in screens/users.js (safe: every screen's
// script() is concatenated into one IIFE, so function declarations hoist
// across files — see client/app.js's header comment).

export function markup() {
  return `
  <div class="screen" id="screen-drivers">
    <h2 style="font-size:1rem;">Drivers</h2>
    <p class="muted" style="margin-bottom:10px;">
      A "driver" here is anyone who has posted at least one offered journey, or has started/completed driver
      verification — the schema has no separate driver role, so this is derived from activity rather than a stored flag.
    </p>
    <p class="muted" id="driversNote" style="margin:10px 0;">Loading…</p>
    <div class="table-wrap">
    <table id="driversTable">
      <thead><tr><th>Name / Email</th><th>Role</th><th>Driver verification</th><th>Passenger?</th><th>Joined</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny btn-neutral" id="driversPrevPage">Prev</button>
      <span class="muted" id="driversPageLabel"></span>
      <button class="btn-tiny btn-neutral" id="driversNextPage">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var driversPage = 1;

  async function loadDrivers(token) {
    const qs = new URLSearchParams({ type: 'driver', page: String(driversPage), pageSize: '50' });
    try {
      const res = await fetch('/api/admin/users?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('driversNote').textContent = 'Could not load drivers.'; return; }
      const data = await res.json();
      document.getElementById('driversNote').textContent = data.total + ' driver(s) total.';
      document.getElementById('driversPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));
      renderUserRows('#driversTable', data.items || [], 'No drivers yet.');
    } catch {
      document.getElementById('driversNote').textContent = 'Could not reach the API.';
    }
  }

  document.getElementById('driversPrevPage').addEventListener('click', function () {
    if (driversPage <= 1) return;
    driversPage -= 1;
    const token = getToken();
    if (token) loadDrivers(token);
  });
  document.getElementById('driversNextPage').addEventListener('click', function () {
    driversPage += 1;
    const token = getToken();
    if (token) loadDrivers(token);
  });
`;
}
