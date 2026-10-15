// Payments screen: paginated, filterable by status/currency. Amounts are
// never summed across currencies — the per-currency totals grid mirrors
// the Dashboard's revenue grid (one stat pair per currency).

export function markup() {
  return `
  <div class="screen" id="screen-payments">
    <h2 style="font-size:1rem;">Payments</h2>
    <div class="toggle-row" style="margin-top:12px;">
      <label class="muted" for="paymentsStatusFilter" style="font-size:0.8rem;">Status:</label>
      <select id="paymentsStatusFilter" class="reviewer-input">
        <option value="">All</option>
        <option value="PENDING">Pending</option>
        <option value="AUTHORIZED">Authorized</option>
        <option value="CAPTURED">Captured</option>
        <option value="FAILED">Failed</option>
        <option value="REFUNDED">Refunded</option>
      </select>
      <label class="muted" for="paymentsCurrencyFilter" style="font-size:0.8rem;">Currency:</label>
      <input type="text" id="paymentsCurrencyFilter" class="reviewer-input" placeholder="e.g. KES" style="width:90px;">
      <button class="btn-tiny" id="paymentsFilterBtn" style="background:#3a3750;color:#eceaf5;">Apply</button>
    </div>
    <div class="grid" id="paymentsTotalsGrid" style="margin-top:14px;"></div>
    <p class="muted" id="paymentsNote" style="margin:10px 0;"></p>
    <table id="paymentsTable">
      <thead><tr><th>Payer</th><th>Method</th><th>Amount</th><th>Status</th><th>Booking</th><th>When</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="toggle-row" style="margin-top:10px;">
      <button class="btn-tiny" id="paymentsPrevPage" style="background:#3a3750;color:#eceaf5;">Prev</button>
      <span class="muted" id="paymentsPageLabel"></span>
      <button class="btn-tiny" id="paymentsNextPage" style="background:#3a3750;color:#eceaf5;">Next</button>
    </div>
  </div>`;
}

export function script() {
  return `
  var paymentsPage = 1;

  async function loadPayments(token) {
    const status = document.getElementById('paymentsStatusFilter').value;
    const currency = document.getElementById('paymentsCurrencyFilter').value.trim();
    const qs = new URLSearchParams({ page: String(paymentsPage), pageSize: '50' });
    if (status) qs.set('status', status);
    if (currency) qs.set('currency', currency);

    try {
      const res = await fetch('/api/admin/payments?' + qs.toString(), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('paymentsNote').textContent = 'Could not load payments.'; return; }
      const data = await res.json();
      document.getElementById('paymentsNote').textContent = data.total + ' payment(s) total.';
      document.getElementById('paymentsPageLabel').textContent = 'Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize));
      renderPaymentsTotals(data.totalsByCurrency || []);
      renderPaymentsTable(data.items || []);
    } catch {
      document.getElementById('paymentsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderPaymentsTotals(totals) {
    // One stat per currency — never a single figure summed across them.
    document.getElementById('paymentsTotalsGrid').innerHTML = totals.length
      ? totals.map(function (t) {
          return '<div class="stat"><div class="val">' + escapeHtml(t.currency) + ' ' + t.total + '</div><div class="lbl">' + t.count + ' payment(s) (' + escapeHtml(t.currency) + ')</div></div>';
        }).join('')
      : '<div class="stat"><div class="val">—</div><div class="lbl">No payments match this filter</div></div>';
  }

  function renderPaymentsTable(items) {
    const body = document.querySelector('#paymentsTable tbody');
    body.innerHTML = items.map(function (p) {
      return '<tr>' +
        '<td>' + escapeHtml(p.payerFullName || (p.payerId || '').slice(0, 12) + '…') + '<br><span class="muted">' + escapeHtml(p.payerEmail || '') + '</span></td>' +
        '<td>' + escapeHtml(p.method) + '</td>' +
        '<td>' + escapeHtml(p.currency) + ' ' + p.amount + '</td>' +
        '<td>' + escapeHtml(p.status) + '</td>' +
        '<td>' + escapeHtml((p.bookingId || '').slice(0, 12)) + '…</td>' +
        '<td>' + new Date(p.createdAt).toLocaleString() + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" style="color:#9490ab;">No payments match this filter.</td></tr>';
  }

  document.getElementById('paymentsFilterBtn').addEventListener('click', function () {
    paymentsPage = 1;
    const token = getToken();
    if (token) loadPayments(token);
  });
  document.getElementById('paymentsPrevPage').addEventListener('click', function () {
    if (paymentsPage <= 1) return;
    paymentsPage -= 1;
    const token = getToken();
    if (token) loadPayments(token);
  });
  document.getElementById('paymentsNextPage').addEventListener('click', function () {
    paymentsPage += 1;
    const token = getToken();
    if (token) loadPayments(token);
  });
`;
}
