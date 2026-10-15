// Disputes screen: open-disputes count, a filterable/paginated table, and a
// per-row Resolve action. Follows the exact markup()/script() shape of
// screens/dashboard.js and screens/driverVerification.js.

export function markup() {
  return `
  <div class="screen" id="screen-disputes">
    <h2 style="font-size:1rem;">Disputes</h2>
    <div class="grid" id="disputesStatGrid"></div>

    <div class="toggle-row" style="margin-top:12px;">
      <label class="muted" for="disputeStatusFilter" style="font-size:0.8rem;">Status:</label>
      <select id="disputeStatusFilter" class="reviewer-input">
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="under_review">Under review</option>
        <option value="resolved_refunded">Resolved (refunded)</option>
        <option value="resolved_denied">Resolved (denied)</option>
        <option value="resolved_other">Resolved (other)</option>
      </select>
      <label class="muted" for="disputeReviewerName" style="font-size:0.8rem;">Reviewing as:</label>
      <input type="text" id="disputeReviewerName" class="reviewer-input" placeholder="Your name" style="width:140px;">
    </div>

    <p class="muted" id="disputesNote" style="margin:10px 0;"></p>
    <table id="disputesTable">
      <thead>
        <tr><th>Booking</th><th>Filed by</th><th>Category</th><th>Amount</th><th>Status</th><th>Filed</th><th>Action</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny" id="disputesPrevPage" style="background:#3a3750;color:#eceaf5;">Prev</button>
      <span class="muted" id="disputesPageLabel"></span>
      <button class="btn-tiny" id="disputesNextPage" style="background:#3a3750;color:#eceaf5;">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var disputesPage = 1;
  var DISPUTES_PAGE_SIZE = 50;

  function disputeReviewerName() {
    return document.getElementById('disputeReviewerName').value.trim() || 'admin';
  }

  async function loadDisputes(token) {
    const status = document.getElementById('disputeStatusFilter').value;
    const qs = new URLSearchParams({ page: String(disputesPage), pageSize: String(DISPUTES_PAGE_SIZE) });
    if (status) qs.set('status', status);

    try {
      const res = await fetch('/api/disputes?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('disputesNote').textContent = 'Could not load disputes.'; return; }
      const data = await res.json();
      renderDisputesStats(data.items);
      renderDisputesTable(data, token);
    } catch {
      document.getElementById('disputesNote').textContent = 'Could not reach the API.';
    }
  }

  function renderDisputesStats(items) {
    const openCount = items.filter(function (d) { return d.status === 'open' || d.status === 'under_review'; }).length;
    document.getElementById('disputesStatGrid').innerHTML =
      '<div class="stat"><div class="val">' + openCount + '</div><div class="lbl">Open on this page</div></div>';
  }

  function renderDisputesTable(data, token) {
    const items = data.items || [];
    document.getElementById('disputesNote').textContent = data.total
      ? data.total + ' dispute(s) total.'
      : 'No disputes filed yet.';
    document.getElementById('disputesPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));

    const body = document.querySelector('#disputesTable tbody');
    body.innerHTML = items.map(function (d) {
      // Currency is per-row, never summed — each amount is shown with its
      // own currency rather than rolled into one aggregate figure.
      const amount = d.disputedAmount != null ? (escapeHtml(d.currency || '') + ' ' + d.disputedAmount) : '—';
      const resolved = d.status.indexOf('resolved_') === 0;
      return '<tr data-id="' + d.id + '">' +
        '<td>' + escapeHtml(d.bookingId.slice(0, 12)) + '…</td>' +
        '<td>' + escapeHtml(d.filedBy.slice(0, 12)) + '…</td>' +
        '<td>' + escapeHtml(d.category) + '</td>' +
        '<td>' + amount + '</td>' +
        '<td>' + escapeHtml(d.status) + '</td>' +
        '<td>' + new Date(d.createdAt).toLocaleString() + '</td>' +
        '<td>' + (resolved
          ? '<span class="muted">' + (d.resolutionNote ? escapeHtml(d.resolutionNote) : 'Resolved') + '</span>'
          : '<button class="btn-tiny btn-approve" data-action="resolve">Resolve</button>') +
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="color:#9490ab;">No disputes match this filter.</td></tr>';

    body.querySelectorAll('button[data-action="resolve"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const resolution = prompt('Resolution — type one of: resolved_refunded, resolved_denied, resolved_other');
        if (!resolution || ['resolved_refunded', 'resolved_denied', 'resolved_other'].indexOf(resolution.trim()) === -1) {
          if (resolution !== null) alert('Must be one of: resolved_refunded, resolved_denied, resolved_other');
          return;
        }
        const resolutionNote = prompt('Resolution note (shown in the dispute history):') || '';
        btn.disabled = true;
        try {
          const res = await fetch('/api/disputes/' + id + '/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
            body: JSON.stringify({ resolution: resolution.trim(), resolutionNote: resolutionNote, resolvedBy: disputeReviewerName() }),
          });
          if (!res.ok) { alert('Could not resolve this dispute.'); btn.disabled = false; return; }
          loadDisputes(token);
        } catch {
          alert('Could not reach the API.');
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById('disputeStatusFilter').addEventListener('change', function () {
    disputesPage = 1;
    const token = getToken();
    if (token) loadDisputes(token);
  });
  document.getElementById('disputesPrevPage').addEventListener('click', function () {
    if (disputesPage <= 1) return;
    disputesPage -= 1;
    const token = getToken();
    if (token) loadDisputes(token);
  });
  document.getElementById('disputesNextPage').addEventListener('click', function () {
    disputesPage += 1;
    const token = getToken();
    if (token) loadDisputes(token);
  });
`;
}
