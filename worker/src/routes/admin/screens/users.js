// Users screen: paginated/searchable table of every user, plus a CSV
// export. Follows the exact markup()/script() shape of screens/disputes.js.

export function markup() {
  return `
  <div class="screen" id="screen-users">
    <h2 style="font-size:1rem;">Users</h2>
    <div class="toggle-row" style="margin-top:12px;">
      <input type="text" id="usersSearch" class="reviewer-input" placeholder="Search name or email" style="width:220px;">
      <button class="btn-tiny" id="usersSearchBtn" style="background:#3a3750;color:#eceaf5;">Search</button>
      <button class="btn-tiny" id="usersExportBtn" style="background:#7c6fef;color:#fff;">Export CSV</button>
      <span class="muted" id="usersExportStatus" style="font-size:0.78rem;"></span>
    </div>
    <p class="muted" id="usersNote" style="margin:10px 0;"></p>
    <table id="usersTable">
      <thead><tr><th>Name / Email</th><th>Role</th><th>Driver verification</th><th>Passenger?</th><th>Joined</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny" id="usersPrevPage" style="background:#3a3750;color:#eceaf5;">Prev</button>
      <span class="muted" id="usersPageLabel"></span>
      <button class="btn-tiny" id="usersNextPage" style="background:#3a3750;color:#eceaf5;">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var usersPage = 1;
  var USERS_PAGE_SIZE = 50;

  function renderUserRows(tableSelector, items, emptyMessage) {
    const body = document.querySelector(tableSelector + ' tbody');
    body.innerHTML = items.map(function (u) {
      return '<tr>' +
        '<td>' + escapeHtml(u.fullName) + '<br><span class="muted">' + escapeHtml(u.email) + '</span></td>' +
        '<td>' + escapeHtml(u.role) + '</td>' +
        '<td>' + escapeHtml(u.driverVerificationStatus) + '</td>' +
        '<td>' + (u.isPassenger ? 'Yes' : 'No') + '</td>' +
        '<td>' + new Date(u.createdAt).toLocaleDateString() + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">' + emptyMessage + '</td></tr>';
  }

  async function loadUsers(token) {
    const search = document.getElementById('usersSearch').value.trim();
    const qs = new URLSearchParams({ page: String(usersPage), pageSize: String(USERS_PAGE_SIZE) });
    if (search) qs.set('search', search);

    try {
      const res = await fetch('/api/admin/users?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('usersNote').textContent = 'Could not load users.'; return; }
      const data = await res.json();
      document.getElementById('usersNote').textContent = data.total + ' user(s) total.';
      document.getElementById('usersPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));
      renderUserRows('#usersTable', data.items || [], 'No users match this search.');
    } catch {
      document.getElementById('usersNote').textContent = 'Could not reach the API.';
    }
  }

  document.getElementById('usersSearchBtn').addEventListener('click', function () {
    usersPage = 1;
    const token = getToken();
    if (token) loadUsers(token);
  });
  document.getElementById('usersSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('usersSearchBtn').click();
  });
  document.getElementById('usersPrevPage').addEventListener('click', function () {
    if (usersPage <= 1) return;
    usersPage -= 1;
    const token = getToken();
    if (token) loadUsers(token);
  });
  document.getElementById('usersNextPage').addEventListener('click', function () {
    usersPage += 1;
    const token = getToken();
    if (token) loadUsers(token);
  });

  document.getElementById('usersExportBtn').addEventListener('click', async function () {
    const token = getToken();
    if (!token) return;
    const statusEl = document.getElementById('usersExportStatus');
    statusEl.textContent = 'Preparing…';
    try {
      const res = await fetch('/api/admin/users/export.csv', { headers: { 'x-admin-token': token } });
      if (!res.ok) { statusEl.textContent = 'Could not export.'; return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match ? match[1] : 'genesis-users.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      statusEl.textContent = 'Downloaded.';
    } catch {
      statusEl.textContent = 'Could not reach the API.';
    }
  });
`;
}
