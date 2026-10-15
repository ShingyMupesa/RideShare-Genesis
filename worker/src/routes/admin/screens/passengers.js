// Passengers screen: thin — reuses GET /api/admin/users?type=passenger and
// the renderUserRows() helper defined in screens/users.js.

export function markup() {
  return `
  <div class="screen" id="screen-passengers">
    <h2 style="font-size:1rem;">Passengers</h2>
    <p class="muted" style="margin-bottom:10px;">
      A "passenger" here is anyone who has ever made a booking — not mutually exclusive with "driver": many drivers
      also book rides as passengers.
    </p>
    <p class="muted" id="passengersNote" style="margin:10px 0;"></p>
    <table id="passengersTable">
      <thead><tr><th>Name / Email</th><th>Role</th><th>Driver verification</th><th>Passenger?</th><th>Joined</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny" id="passengersPrevPage" style="background:#3a3750;color:#eceaf5;">Prev</button>
      <span class="muted" id="passengersPageLabel"></span>
      <button class="btn-tiny" id="passengersNextPage" style="background:#3a3750;color:#eceaf5;">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var passengersPage = 1;

  async function loadPassengers(token) {
    const qs = new URLSearchParams({ type: 'passenger', page: String(passengersPage), pageSize: '50' });
    try {
      const res = await fetch('/api/admin/users?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('passengersNote').textContent = 'Could not load passengers.'; return; }
      const data = await res.json();
      document.getElementById('passengersNote').textContent = data.total + ' passenger(s) total.';
      document.getElementById('passengersPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));
      renderUserRows('#passengersTable', data.items || [], 'No passengers yet.');
    } catch {
      document.getElementById('passengersNote').textContent = 'Could not reach the API.';
    }
  }

  document.getElementById('passengersPrevPage').addEventListener('click', function () {
    if (passengersPage <= 1) return;
    passengersPage -= 1;
    const token = getToken();
    if (token) loadPassengers(token);
  });
  document.getElementById('passengersNextPage').addEventListener('click', function () {
    passengersPage += 1;
    const token = getToken();
    if (token) loadPassengers(token);
  });
`;
}
