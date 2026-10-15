// Config screen: shows every key in GET /api/admin/platform-settings, each
// editable via its own small form posting to POST /api/admin/platform-settings,
// with a badge showing whether it's "using default" (fromEnvFallback: true)
// or explicitly set. Follows the exact markup()/script() shape of the other
// screens/*.js files.

// Human-friendly label + helper text for each of the 6 allowed keys (kept
// here, not server-side, since it's presentation only).
const SETTING_META = {
  commission_rate_pct: { label: 'Commission rate (%)', help: 'Platform commission taken on each captured payment, as a percentage.' },
  surge_cap_multiplier: { label: 'Surge cap multiplier', help: 'Hard ceiling on the advisory surge-pricing suggestion shown to drivers (e.g. 1.5 = never suggest more than 1.5x). Never auto-applied to any price.' },
  min_fare_amount: { label: 'Minimum fare (amount)', help: 'Floor on a journey’s price per seat, in min_fare_currency. 0 = unenforced.' },
  min_fare_currency: { label: 'Minimum fare (currency)', help: '3-letter currency code the minimum fare amount is denominated in.' },
  payout_threshold_amount: { label: 'Payout threshold (amount)', help: 'Minimum driver balance before a payout is triggered, in payout_threshold_currency. 0 = unenforced.' },
  payout_threshold_currency: { label: 'Payout threshold (currency)', help: '3-letter currency code the payout threshold amount is denominated in.' },
};
const SETTING_KEYS = Object.keys(SETTING_META);

export function markup() {
  const rows = SETTING_KEYS.map(function (key) {
    const meta = SETTING_META[key];
    return `
      <div class="config-row" id="configRow-${key}" style="border:1px solid #2c2940; border-radius:10px; padding:14px 16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;">
          <strong style="font-size:0.9rem;">${meta.label}</strong>
          <span class="badge" id="configBadge-${key}"></span>
        </div>
        <p class="muted" style="font-size:0.78rem; margin:4px 0 10px;">${meta.help}</p>
        <div class="toggle-row" style="margin:0;">
          <input type="text" class="reviewer-input" id="configInput-${key}" style="width:200px;">
          <button class="btn-tiny" data-save="${key}" style="background:#7c6fef;color:#fff;">Save</button>
          <span class="muted" id="configStatus-${key}" style="font-size:0.78rem;"></span>
        </div>
      </div>`;
  }).join('');

  return `
  <div class="screen" id="screen-config">
    <h2 style="font-size:1rem;">Config</h2>
    <p class="muted" style="margin-bottom:14px;">
      Platform-wide settings, backed by the platform_settings table. Anything not explicitly set here falls back to a
      hardcoded or environment-variable default (marked "using default" below) — nothing changes just because this
      screen exists.
    </p>
    <p class="muted" id="configNote" style="margin-bottom:10px;"></p>
    ${rows}
  </div>`;
}

export function script() {
  return `
  var CONFIG_KEYS = ${JSON.stringify(SETTING_KEYS)};

  async function loadConfig(token) {
    try {
      const res = await fetch('/api/admin/platform-settings', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('configNote').textContent = 'Could not load platform settings.'; return; }
      const data = await res.json();
      renderConfig(data.settings || {});
    } catch {
      document.getElementById('configNote').textContent = 'Could not reach the API.';
    }
  }

  function renderConfig(settings) {
    document.getElementById('configNote').textContent = '';
    CONFIG_KEYS.forEach(function (key) {
      const s = settings[key];
      if (!s) return;
      const input = document.getElementById('configInput-' + key);
      // Don't clobber text the admin is mid-way through editing on an
      // auto-refresh tick.
      if (document.activeElement !== input) input.value = s.value;
      const badge = document.getElementById('configBadge-' + key);
      if (s.fromEnvFallback) {
        badge.textContent = 'Using default';
        badge.style.background = '#3a3750';
        badge.style.color = '#cfcadf';
      } else {
        badge.textContent = 'Explicitly set';
        badge.style.background = 'rgba(31, 157, 85, 0.25)';
        badge.style.color = '#6fe3a0';
      }
    });
  }

  document.querySelectorAll('button[data-save]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const key = btn.getAttribute('data-save');
      const token = getToken();
      if (!token) return;
      const value = document.getElementById('configInput-' + key).value;
      const statusEl = document.getElementById('configStatus-' + key);
      btn.disabled = true;
      statusEl.textContent = 'Saving…';
      try {
        const res = await fetch('/api/admin/platform-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ key: key, value: value }),
        });
        if (!res.ok) { statusEl.textContent = 'Could not save.'; btn.disabled = false; return; }
        statusEl.textContent = 'Saved.';
        loadConfig(token);
      } catch {
        statusEl.textContent = 'Could not reach the API.';
      } finally {
        btn.disabled = false;
      }
    });
  });
`;
}
