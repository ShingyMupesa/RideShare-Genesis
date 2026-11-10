// Admin Team screen: Owner (and Owner-appointed Super Admins) approve
// access requests, assign roles, suspend, reactivate and remove members.
// Every change needs the signed-in admin's password again (the server
// enforces this; the field here just collects it).

export function markup() {
  return `
  <div class="screen" id="screen-adminTeam">
    <h2 style="font-size:1rem;">Admin Team</h2>
    <p class="muted" style="margin-bottom:10px;">
      Only people listed here as <strong>Active</strong> can sign in to this dashboard, and only to the areas their role allows.
      Requests come from the "Admin Dashboard" section of a user's Profile. Suspending, removing or changing a role signs
      that person out immediately. The Owner can't be changed here, and only the Owner can appoint a Super Admin.
    </p>
    <div id="teamOwner" class="muted" style="margin-bottom:10px;"></div>

    <div style="border:1px solid #2c2940; border-radius:10px; padding:14px 16px; margin:12px 0;">
      <label class="muted" for="teamPassword" style="font-size:0.8rem;">Confirm your password to make changes</label><br>
      <input type="password" id="teamPassword" autocomplete="current-password" placeholder="Your password" style="max-width:260px;">
      <p class="error" id="teamStatus" style="margin-top:6px;"></p>
    </div>

    <h3 style="font-size:0.9rem;">Add an existing user</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0 18px;">
      <input type="email" id="teamAddEmail" placeholder="Their Genesis account email" style="max-width:260px;">
      <select id="teamAddRole"></select>
      <button class="btn-tiny btn-approve" id="teamAddBtn">Add to team</button>
    </div>

    <h3 style="font-size:0.9rem;">Members and requests <button class="btn-tiny btn-neutral" id="teamRefreshBtn">Reload</button></h3>
    <div class="table-wrap">
      <table id="teamTable">
        <thead><tr><th>Person</th><th>Status</th><th>Role</th><th>Request / history</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <h3 style="font-size:0.9rem; margin-top:22px;">Roles</h3>
    <div id="teamRoles" class="muted" style="font-size:0.82rem;"></div>
  </div>`;
}

export function script() {
  return `
  var teamRoles = [];

  function teamRoleOptions(selected) {
    return teamRoles
      .filter(function (r) { return !r.ownerOnly || (adminPerms && adminPerms.isOwner); })
      .map(function (r) {
        return '<option value="' + r.key + '"' + (r.key === selected ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>';
      }).join('');
  }

  async function teamCall(token, path, body) {
    const status = document.getElementById('teamStatus');
    const password = document.getElementById('teamPassword').value;
    if (!password) { status.textContent = 'Enter your password above first.'; return false; }
    status.textContent = '';
    try {
      const res = await fetch('/api/admin-team' + path, {
        method: 'POST',
        headers: { 'x-admin-token': token, 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ password: password }, body || {})),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) { status.textContent = (data.error && data.error.message) || ('Failed (' + res.status + ')'); return false; }
      status.style.color = '#6fcf97';
      status.textContent = 'Saved.';
      setTimeout(function () { status.textContent = ''; status.style.color = ''; }, 2500);
      loadAdminTeam(token);
      return true;
    } catch (err) {
      status.textContent = 'Could not reach the API: ' + err.message;
      return false;
    }
  }

  async function loadAdminTeam(token) {
    try {
      const res = await fetch('/api/admin-team/members', { headers: { 'x-admin-token': token } });
      if (!res.ok) return;
      const data = await res.json();
      teamRoles = data.roles || [];
      document.getElementById('teamOwner').innerHTML = data.owner
        ? 'Owner: <strong>' + escapeHtml(data.owner.fullName || '') + '</strong> (' + escapeHtml(data.owner.email) + ')'
        : '<span class="error">No Owner is configured.</span>';
      document.getElementById('teamAddRole').innerHTML = teamRoleOptions('viewer');
      document.getElementById('teamRoles').innerHTML = teamRoles.map(function (r) {
        return '<div style="margin-bottom:4px;"><strong>' + escapeHtml(r.label) + '</strong>' + (r.ownerOnly ? ' (Owner appoints only)' : '') + ': ' + escapeHtml(r.description) + '</div>';
      }).join('');
      renderTeamTable(data.members || [], token);
    } catch {
      document.getElementById('teamStatus').textContent = 'Could not load the Admin Team.';
    }
  }

  function teamBadge(status) {
    const cls = { active: 'badge-active', pending: 'badge-pending', suspended: 'badge-rejected', removed: '' }[status] || '';
    return '<span class="badge ' + cls + '">' + escapeHtml(status) + '</span>';
  }

  function renderTeamTable(members, token) {
    const body = document.querySelector('#teamTable tbody');
    body.innerHTML = members.map(function (m) {
      let actions = '';
      if (m.status === 'pending') {
        actions = '<select data-role>' + teamRoleOptions('viewer') + '</select> ' +
          '<button class="btn-tiny btn-approve" data-act="approve">Approve</button>' +
          '<button class="btn-tiny btn-reject" data-act="reject">Reject</button>';
      } else if (m.status === 'active') {
        actions = '<select data-role>' + teamRoleOptions(m.role) + '</select> ' +
          '<button class="btn-tiny btn-neutral" data-act="role">Change role</button>' +
          '<button class="btn-tiny btn-reject" data-act="suspend">Suspend</button>' +
          '<button class="btn-tiny btn-reject" data-act="remove">Remove</button>';
      } else if (m.status === 'suspended') {
        actions = '<button class="btn-tiny btn-approve" data-act="reactivate">Reactivate</button>' +
          '<button class="btn-tiny btn-reject" data-act="remove">Remove</button>';
      }
      const history = [
        m.requestReason ? 'Reason: ' + escapeHtml(m.requestReason) : '',
        m.decidedBy ? 'Last decision by ' + escapeHtml(m.decidedBy) + ' on ' + escapeHtml(m.decidedAt || '') : '',
        m.lastLoginAt ? 'Last sign-in ' + escapeHtml(m.lastLoginAt) : '',
      ].filter(Boolean).join('<br>');
      return '<tr data-id="' + escapeHtml(m.userId) + '">' +
        '<td>' + escapeHtml(m.fullName || '') + '<br><span class="muted">' + escapeHtml(m.email) + '</span></td>' +
        '<td>' + teamBadge(m.status) + '</td>' +
        '<td>' + escapeHtml(m.roleLabel || '—') + '</td>' +
        '<td class="muted" style="font-size:0.78rem;">' + (history || '—') + '</td>' +
        '<td>' + actions + '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">No Admin Team members or requests yet.</td></tr>';

    body.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const row = btn.closest('tr');
        const id = row.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        const roleSel = row.querySelector('select[data-role]');
        const payload = {};
        if (act === 'approve' || act === 'role') payload.role = roleSel.value;
        if (act === 'suspend' || act === 'remove' || act === 'reject') {
          const reason = prompt('Reason (kept in the audit log):', '');
          if (reason === null) return;
          payload.reason = reason;
        }
        if ((act === 'remove' || act === 'suspend') && !confirm('Are you sure? This signs them out immediately.')) return;
        btn.disabled = true;
        await teamCall(token, '/members/' + encodeURIComponent(id) + '/' + act, payload);
        btn.disabled = false;
      });
    });
  }

  document.getElementById('teamAddBtn').addEventListener('click', async function () {
    const email = document.getElementById('teamAddEmail').value.trim();
    if (!email) { document.getElementById('teamStatus').textContent = 'Enter an email.'; return; }
    const ok = await teamCall(getToken(), '/members', { email: email, role: document.getElementById('teamAddRole').value });
    if (ok) document.getElementById('teamAddEmail').value = '';
  });
  document.getElementById('teamRefreshBtn').addEventListener('click', function () { loadAdminTeam(getToken()); });
`;
}
