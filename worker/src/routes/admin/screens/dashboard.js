// Dashboard screen: stats grid, CTA table, 14-day table, revenue/commission,
// environmental impact, and feedback list. Split out verbatim from the
// single admin.js that existed before this refactor — logic unchanged.

export function markup() {
  return `
  <div class="screen active" id="screen-dashboard">
    <div class="grid" id="statGrid"></div>

    <section>
      <h2 style="font-size:1rem;">Where our users are</h2>
      <p class="muted" id="userLocationsNote" style="margin-bottom:10px;">Loading…</p>
      <p class="muted" style="font-size:0.78rem; margin-top:-6px; margin-bottom:10px;">
        Each pin is a user's most recent journey origin — not live tracking. A user who hasn't posted a journey has no pin.
      </p>
      <div id="userLocationsEmpty" class="muted" style="display:none; padding:50px 0; text-align:center; border:1px solid #2c2940; border-radius:10px;">
        No journeys with a location on file yet.
      </div>
      <div id="userLocationsContainer" style="display:none; height:360px; border-radius:10px; overflow:hidden; border:1px solid #2c2940;"></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">CTA clicks by type</h2>
      <div class="table-wrap"><table id="ctaTable"><thead><tr><th>Label</th><th>Clicks</th></tr></thead><tbody></tbody></table></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Last 14 days</h2>
      <div class="table-wrap"><table id="dailyTable"><thead><tr><th>Day</th><th>Page views</th><th>CTA clicks</th></tr></thead><tbody></tbody></table></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Revenue &amp; commission</h2>
      <p class="muted" id="revenueNote" style="margin-bottom:10px;"></p>
      <div class="grid" id="revenueGrid"></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Environmental impact (estimated)</h2>
      <p class="muted" id="impactMethodology" style="margin-bottom:10px;"></p>
      <div class="grid" id="impactGrid"></div>
    </section>

    <section>
      <h2 style="font-size:1rem;">Feedback</h2>
      <div class="table-wrap"><table id="feedbackTable"><thead><tr><th>When</th><th>Message</th><th>Email</th><th>Page</th></tr></thead><tbody></tbody></table></div>
    </section>
  </div>`;
}

export function script() {
  return `
  async function loadStats() {
    const token = getToken();
    if (!token) { showGate(''); return; }
    try {
      const res = await fetch('/api/tracking/stats', { headers: { 'x-admin-token': token } });
      if (res.status === 401) { clearToken(); showGate('Invalid token.'); return; }
      const data = await res.json();
      if (!res.ok) { showGate(data?.error?.message || ('Server error (' + res.status + ').')); return; }
      renderStats(data);
      gate.style.display = 'none';
      app.style.display = 'block';
      loadFeedback(token);
      loadUserLocations(token);
      loadDriverVerification(token);
      loadDisputes(token);
      loadLiveMap(token);
      loadMonetisation(token);
      loadAdSlots(token);
      loadInsurancePartners(token);
      loadConfig(token);
      loadAnalytics(token);
      loadUsers(token);
      loadDrivers(token);
      loadPassengers(token);
      loadRides(token);
      loadPayments(token);
      loadUxMetrics(token);
      loadSystemLogs(token);
    } catch (err) {
      showGate('Could not reach the API: ' + err.message);
    }
  }

  async function loadFeedback(token) {
    try {
      const res = await fetch('/api/feedback/list', { headers: { 'x-admin-token': token } });
      if (!res.ok) return;
      const data = await res.json();
      const body = document.querySelector('#feedbackTable tbody');
      body.innerHTML = data.feedback.length
        ? data.feedback.map(function (f) {
            return '<tr><td>' + new Date(f.created_at).toLocaleString() + '</td><td>' + escapeHtml(f.message) +
              '</td><td>' + escapeHtml(f.email || '—') + '</td><td>' + escapeHtml(f.page || '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" style="color:#9490ab;">No feedback yet.</td></tr>';
    } catch {
      // non-fatal — the rest of the dashboard still works
    }
  }

  var userLocationsMapInstance = null;
  var userLocationsMarkers = {};

  function ensureUserLocationsMap() {
    if (userLocationsMapInstance) return userLocationsMapInstance;
    if (typeof L === 'undefined') return null;
    userLocationsMapInstance = L.map('userLocationsContainer').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(userLocationsMapInstance);
    return userLocationsMapInstance;
  }

  async function loadUserLocations(token) {
    try {
      const res = await fetch('/api/admin/user-locations', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('userLocationsNote').textContent = 'Could not load user locations.'; return; }
      const data = await res.json();
      renderUserLocations(data.locations || []);
    } catch {
      document.getElementById('userLocationsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderUserLocations(locations) {
    document.getElementById('userLocationsNote').textContent = locations.length
      ? locations.length + ' user' + (locations.length === 1 ? '' : 's') + ' with a known location.'
      : '';

    const emptyEl = document.getElementById('userLocationsEmpty');
    const mapEl = document.getElementById('userLocationsContainer');

    if (!locations.length) {
      emptyEl.style.display = 'block';
      mapEl.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    mapEl.style.display = 'block';

    const map = ensureUserLocationsMap();
    if (!map) { document.getElementById('userLocationsNote').textContent = 'Map library failed to load.'; return; }
    setTimeout(function () { map.invalidateSize(); }, 0);

    const seen = {};
    locations.forEach(function (loc) {
      seen[loc.userId] = true;
      const latlng = [loc.lat, loc.lng];
      let marker = userLocationsMarkers[loc.userId];
      if (!marker) {
        marker = L.marker(latlng).addTo(map);
        userLocationsMarkers[loc.userId] = marker;
      } else {
        marker.setLatLng(latlng);
      }
      marker.bindPopup(
        '<strong>' + escapeHtml(loc.fullName) + '</strong><br>' +
        escapeHtml(loc.label || '') + '<br>' +
        '<span style="color:#666;">Last posted ' + new Date(loc.lastActivityAt).toLocaleDateString() + '</span>'
      );
    });

    Object.keys(userLocationsMarkers).forEach(function (userId) {
      if (!seen[userId]) {
        map.removeLayer(userLocationsMarkers[userId]);
        delete userLocationsMarkers[userId];
      }
    });

    const bounds = L.latLngBounds(locations.map(function (loc) { return [loc.lat, loc.lng]; }));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }

  function renderStats(data) {
    document.getElementById('generatedAt').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleString();

    const grid = document.getElementById('statGrid');
    const stats = [
      ['Page views', data.pageViews],
      ['CTA clicks', data.ctaClicks],
      ['Signups', data.productMetrics.totalUsers],
      ['Bookings', data.productMetrics.totalBookings],
      ['Safety cases', data.productMetrics.totalSafetyCases],
    ];
    grid.innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="val">' + s[1] + '</div><div class="lbl">' + s[0] + '</div></div>';
    }).join('');

    const ctaBody = document.querySelector('#ctaTable tbody');
    ctaBody.innerHTML = data.ctaByLabel.length
      ? data.ctaByLabel.map(function (r) { return '<tr><td>' + r.label + '</td><td>' + r.n + '</td></tr>'; }).join('')
      : '<tr><td colspan="2" style="color:#9490ab;">No CTA clicks yet.</td></tr>';

    const byDay = {};
    data.dailySeries.forEach(function (r) {
      byDay[r.day] = byDay[r.day] || { page_view: 0, cta_click: 0 };
      byDay[r.day][r.event_type] = r.n;
    });
    const days = Object.keys(byDay).sort().reverse();
    const dailyBody = document.querySelector('#dailyTable tbody');
    dailyBody.innerHTML = days.length
      ? days.map(function (d) {
          return '<tr><td>' + d + '</td><td>' + byDay[d].page_view + '</td><td>' + byDay[d].cta_click + '</td></tr>';
        }).join('')
      : '<tr><td colspan="3" style="color:#9490ab;">No activity yet.</td></tr>';

    const revenue = data.revenue || {};
    document.getElementById('revenueNote').textContent = revenue.note || '';
    const byCurrency = revenue.byCurrency || [];
    // Journeys can be posted in any currency, so gross/commission are never
    // summed across currencies into one figure — one stat pair per currency.
    document.getElementById('revenueGrid').innerHTML = byCurrency.length
      ? byCurrency.map(function (r) {
          return (
            '<div class="stat"><div class="val">' + formatMoney(r.currency, r.grossCaptured) + '</div><div class="lbl">Gross captured (' + escapeHtml(r.currency) + ')</div></div>' +
            '<div class="stat"><div class="val">' + formatMoney(r.currency, r.commissionCollected) + '</div><div class="lbl">Commission collected (' + escapeHtml(r.currency) + ')</div></div>'
          );
        }).join('')
      : '<div class="stat"><div class="val">—</div><div class="lbl">No captured payments yet</div></div>';

    const impact = data.environmentalImpact || {};
    document.getElementById('impactMethodology').textContent = impact.methodology || '';
    const impactStats = [
      ['Shared journeys completed', impact.sharedJourneysCompleted || 0],
      ['Passenger seats utilised', impact.seatsUtilised || 0],
      ['Est. vehicle-km avoided', impact.vehicleKmAvoided || 0],
      ['Est. CO2e avoided (kg)', impact.co2eKgAvoided || 0],
      ['Est. fuel avoided (L)', impact.fuelLitersAvoided || 0],
      ['EV/hybrid offers', impact.cleanVehiclePct === null || impact.cleanVehiclePct === undefined ? 'n/a' : impact.cleanVehiclePct + '%'],
    ];
    document.getElementById('impactGrid').innerHTML = impactStats.map(function (s) {
      return '<div class="stat"><div class="val">' + s[1] + '</div><div class="lbl">' + s[0] + '</div></div>';
    }).join('');
  }
`;
}
