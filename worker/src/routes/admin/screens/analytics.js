// Analytics screen: richer breakdowns of data that already exists in
// tracking.js's /stats response (pageBreakdown, revenue.dailySeries) — no
// new tables, no duplicated query logic, just a second read of the same
// endpoint the Dashboard screen already uses.

export function markup() {
  return `
  <div class="screen" id="screen-analytics">
    <h2 style="font-size:1rem;">Analytics</h2>
    <p class="muted" id="analyticsNote" style="margin:10px 0;">Loading…</p>

    <section style="margin-top:12px;">
      <h3 style="font-size:0.9rem;">Page views by page</h3>
      <div class="table-wrap"><table id="analyticsPageTable"><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody></tbody></table></div>
    </section>

    <section>
      <h3 style="font-size:0.9rem;">CTA clicks by label</h3>
      <div class="table-wrap"><table id="analyticsCtaTable"><thead><tr><th>Label</th><th>Clicks</th></tr></thead><tbody></tbody></table></div>
    </section>

    <section>
      <h3 style="font-size:0.9rem;">Revenue trend (last 14 days, by currency)</h3>
      <p class="muted" style="margin-bottom:8px;">Never summed across currencies — each row is one currency's own captured total for that day.</p>
      <div class="table-wrap"><table id="analyticsRevenueTable"><thead><tr><th>Day</th><th>Currency</th><th>Gross captured</th></tr></thead><tbody></tbody></table></div>
    </section>
  </div>`;
}

export function script() {
  return `
  async function loadAnalytics(token) {
    try {
      const res = await fetch('/api/tracking/stats', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('analyticsNote').textContent = 'Could not load analytics.'; return; }
      const data = await res.json();
      document.getElementById('analyticsNote').textContent = '';
      renderAnalyticsPages(data.pageBreakdown || []);
      renderAnalyticsCta(data.ctaByLabel || []);
      renderAnalyticsRevenue((data.revenue && data.revenue.dailySeries) || []);
    } catch {
      document.getElementById('analyticsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderAnalyticsPages(rows) {
    const body = document.querySelector('#analyticsPageTable tbody');
    body.innerHTML = rows.length
      ? rows.map(function (r) { return '<tr><td>' + escapeHtml(r.page) + '</td><td>' + r.n + '</td></tr>'; }).join('')
      : '<tr><td colspan="2" style="color:#9490ab;">No page views yet.</td></tr>';
  }

  function renderAnalyticsCta(rows) {
    const body = document.querySelector('#analyticsCtaTable tbody');
    body.innerHTML = rows.length
      ? rows.map(function (r) { return '<tr><td>' + escapeHtml(r.label) + '</td><td>' + r.n + '</td></tr>'; }).join('')
      : '<tr><td colspan="2" style="color:#9490ab;">No CTA clicks yet.</td></tr>';
  }

  function renderAnalyticsRevenue(rows) {
    const body = document.querySelector('#analyticsRevenueTable tbody');
    // Most recent day first — easier to read as a trend at a glance. The
    // API already returns these ordered oldest-to-newest (GROUP BY day ASC).
    const ordered = rows.slice().reverse();
    body.innerHTML = ordered.length
      ? ordered.map(function (r) {
          return '<tr><td>' + r.day + '</td><td>' + escapeHtml(r.currency) + '</td><td>' + formatMoney(r.currency, r.grossCaptured) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="3" style="color:#9490ab;">No captured payments in the last 14 days.</td></tr>';
  }
`;
}
