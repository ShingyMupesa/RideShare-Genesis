// System Logs screen: reverse-chronological audit trail via the new
// GET /api/governance/audit-events-admin route (a requireAdmin sibling of
// the JWT-gated /audit-events route, which this admin-token-only panel can
// never satisfy).

export function markup() {
  return `
  <div class="screen" id="screen-systemLogs">
    <h2 style="font-size:1rem;">System Logs</h2>
    <div class="toggle-row" style="margin-top:12px;">
      <label class="muted" for="logsEntityTypeFilter" style="font-size:0.8rem;">Entity type:</label>
      <input type="text" id="logsEntityTypeFilter" class="reviewer-input" placeholder="e.g. booking, payment, dispute" style="width:180px;">
      <label class="muted" for="logsLimit" style="font-size:0.8rem;">Limit:</label>
      <select id="logsLimit" class="reviewer-input">
        <option value="50">50</option>
        <option value="100" selected>100</option>
        <option value="250">250</option>
      </select>
      <button class="btn-tiny btn-neutral" id="logsFilterBtn">Apply</button>
    </div>
    <p class="muted" id="logsNote" style="margin:10px 0;">Loading…</p>
    <div class="table-wrap">
    <table id="logsTable">
      <thead><tr><th>When</th><th>Event</th><th>Entity</th><th>Actor</th><th>Metadata</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
  </div>`;
}

export function script() {
  return `
  async function loadSystemLogs(token) {
    const entityType = document.getElementById('logsEntityTypeFilter').value.trim();
    const limit = document.getElementById('logsLimit').value;
    const qs = new URLSearchParams({ limit: limit });
    if (entityType) qs.set('entityType', entityType);

    try {
      const res = await fetch('/api/governance/audit-events-admin?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('logsNote').textContent = 'Could not load system logs.'; return; }
      const data = await res.json();
      renderSystemLogs(data.events || []);
    } catch {
      document.getElementById('logsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderSystemLogs(events) {
    document.getElementById('logsNote').textContent = events.length
      ? events.length + ' event(s) shown.'
      : 'No audit events recorded yet.';
    const body = document.querySelector('#logsTable tbody');
    body.innerHTML = events.map(function (e) {
      const metadata = e.metadata ? JSON.stringify(e.metadata) : '—';
      return '<tr>' +
        '<td>' + new Date(e.created_at).toLocaleString() + '</td>' +
        '<td>' + escapeHtml(e.event_type) + '</td>' +
        '<td>' + escapeHtml(e.entity_type) + (e.entity_id ? ': ' + escapeHtml(String(e.entity_id).slice(0, 12)) + '…' : '') + '</td>' +
        '<td>' + escapeHtml(e.actor_id ? String(e.actor_id).slice(0, 12) + '…' : 'system') + '</td>' +
        '<td style="max-width:280px; overflow-wrap:break-word;"><span class="muted">' + escapeHtml(metadata) + '</span></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">No audit events match this filter.</td></tr>';
  }

  document.getElementById('logsFilterBtn').addEventListener('click', function () {
    const token = getToken();
    if (token) loadSystemLogs(token);
  });
`;
}
