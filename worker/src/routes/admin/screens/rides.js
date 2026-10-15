// Rides screen: paginated journeys list (offers and requests), filterable
// by type/status. Follows the exact markup()/script() shape of
// screens/disputes.js.

export function markup() {
  return `
  <div class="screen" id="screen-rides">
    <h2 style="font-size:1rem;">Rides</h2>
    <div class="toggle-row" style="margin-top:12px;">
      <label class="muted" for="ridesTypeFilter" style="font-size:0.8rem;">Type:</label>
      <select id="ridesTypeFilter" class="reviewer-input">
        <option value="">All</option>
        <option value="offer">Offer</option>
        <option value="request">Request</option>
      </select>
      <label class="muted" for="ridesStatusFilter" style="font-size:0.8rem;">Status:</label>
      <select id="ridesStatusFilter" class="reviewer-input">
        <option value="">All</option>
        <option value="active">Active</option>
        <option value="full">Full</option>
        <option value="cancelled">Cancelled</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <p class="muted" id="ridesNote" style="margin:10px 0;">Loading…</p>
    <div class="table-wrap">
    <table id="ridesTable">
      <thead><tr><th>Route</th><th>Type</th><th>Price</th><th>Seats</th><th>Status</th><th>Owner</th><th>Posted</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny btn-neutral" id="ridesPrevPage">Prev</button>
      <span class="muted" id="ridesPageLabel"></span>
      <button class="btn-tiny btn-neutral" id="ridesNextPage">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var ridesPage = 1;

  async function loadRides(token) {
    const type = document.getElementById('ridesTypeFilter').value;
    const status = document.getElementById('ridesStatusFilter').value;
    const qs = new URLSearchParams({ page: String(ridesPage), pageSize: '50' });
    if (type) qs.set('type', type);
    if (status) qs.set('status', status);

    try {
      const res = await fetch('/api/admin/rides?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('ridesNote').textContent = 'Could not load rides.'; return; }
      const data = await res.json();
      document.getElementById('ridesNote').textContent = data.total + ' ride(s) total.';
      document.getElementById('ridesPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));
      renderRidesTable(data.items || []);
    } catch {
      document.getElementById('ridesNote').textContent = 'Could not reach the API.';
    }
  }

  function renderRidesTable(items) {
    const body = document.querySelector('#ridesTable tbody');
    body.innerHTML = items.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.originLabel) + ' &rarr; ' + escapeHtml(r.destinationLabel) + '</td>' +
        '<td>' + escapeHtml(r.type) + '</td>' +
        '<td>' + escapeHtml(r.currency) + ' ' + r.pricePerSeat + '</td>' +
        '<td>' + r.seatsAvailable + '/' + r.seatsTotal + '</td>' +
        '<td>' + escapeHtml(r.status) + '</td>' +
        '<td>' + escapeHtml(r.owner.fullName) + '<br><span class="muted">' + escapeHtml(r.owner.email) + '</span></td>' +
        '<td>' + new Date(r.createdAt).toLocaleDateString() + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="color:#9490ab;">No rides match this filter.</td></tr>';
  }

  document.getElementById('ridesTypeFilter').addEventListener('change', function () {
    ridesPage = 1;
    const token = getToken();
    if (token) loadRides(token);
  });
  document.getElementById('ridesStatusFilter').addEventListener('change', function () {
    ridesPage = 1;
    const token = getToken();
    if (token) loadRides(token);
  });
  document.getElementById('ridesPrevPage').addEventListener('click', function () {
    if (ridesPage <= 1) return;
    ridesPage -= 1;
    const token = getToken();
    if (token) loadRides(token);
  });
  document.getElementById('ridesNextPage').addEventListener('click', function () {
    ridesPage += 1;
    const token = getToken();
    if (token) loadRides(token);
  });
`;
}
