// UX Metrics screen: real step-by-step funnel counts from the new
// funnel_events table (GET /api/admin/funnel-stats), shown as a stack of
// horizontal bars sized by relative count — no charting library needed.

const STEP_LABELS = {
  signup_started: 'Signup started',
  signup_completed: 'Signup completed',
  first_journey_posted: 'First journey posted',
  first_booking_made: 'First booking made',
  booking_completed: 'Booking completed',
};

export function markup() {
  return `
  <div class="screen" id="screen-uxMetrics">
    <h2 style="font-size:1rem;">UX Metrics — signup &amp; booking funnel</h2>
    <p class="muted" style="margin-bottom:10px;">
      Genesis is pre-launch — an early pilot with a handful of real users. These are the actual, currently-small
      counts from real instrumentation, not a projection or a mockup of what a mature funnel would look like.
    </p>
    <div class="toggle-row" style="margin-bottom:10px;">
      <label class="muted" for="uxMetricsWindow" style="font-size:0.8rem;">Window:</label>
      <select id="uxMetricsWindow" class="reviewer-input">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </div>
    <p class="muted" id="uxMetricsNote" style="margin-bottom:12px;">Loading…</p>
    <div id="uxFunnelChart"></div>
  </div>`;
}

export function script() {
  return `
  async function loadUxMetrics(token) {
    const days = document.getElementById('uxMetricsWindow').value;
    try {
      const res = await fetch('/api/admin/funnel-stats?days=' + encodeURIComponent(days), { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('uxMetricsNote').textContent = 'Could not load funnel stats.'; return; }
      const data = await res.json();
      renderUxFunnel(data);
    } catch {
      document.getElementById('uxMetricsNote').textContent = 'Could not reach the API.';
    }
  }

  const UX_STEP_LABELS = ${JSON.stringify(STEP_LABELS)};

  function renderUxFunnel(data) {
    const steps = data.steps || [];
    document.getElementById('uxMetricsNote').textContent =
      'Showing the last ' + data.windowDays + ' day(s). Each bar is sized relative to the first step (signup started) in this window.';

    const maxCount = Math.max(1, steps.length ? steps[0].count : 1);
    document.getElementById('uxFunnelChart').innerHTML = steps.map(function (s) {
      const pct = Math.max(2, Math.round((s.count / maxCount) * 100));
      const label = UX_STEP_LABELS[s.eventType] || s.eventType;
      return (
        '<div style="margin:10px 0;">' +
          '<div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">' +
            '<span>' + escapeHtml(label) + '</span><span class="muted">' + s.count + '</span>' +
          '</div>' +
          '<div style="background:#1a1826; border:1px solid #2c2940; border-radius:6px; overflow:hidden; height:20px;">' +
            '<div style="width:' + pct + '%; height:100%; background:#7c6fef;"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('') || '<p class="muted">No funnel events recorded yet.</p>';
  }

  document.getElementById('uxMetricsWindow').addEventListener('change', function () {
    const token = getToken();
    if (token) loadUxMetrics(token);
  });
`;
}
