// Live map screen: polls /api/admin/live-map and plots one Leaflet marker
// per actively-tracked booking (a GPS ping within the last 2 minutes),
// with a popup showing the route label. Leaflet itself (and its CSS) is
// loaded from a CDN by shell.js's externalHeadTags() — this file only
// assumes a global `L` exists. Follows the exact markup()/script() shape
// of screens/dashboard.js and screens/disputes.js.

export function markup() {
  return `
  <div class="screen" id="screen-liveMap">
    <h2 style="font-size:1rem;">Live map</h2>
    <p class="muted" id="liveMapNote" style="margin-bottom:10px;"></p>
    <div id="liveMapEmpty" class="muted" style="display:none; padding:50px 0; text-align:center; border:1px solid #2c2940; border-radius:10px;">
      No active rides right now.
    </div>
    <div id="liveMapContainer" style="display:none; height:420px; border-radius:10px; overflow:hidden; border:1px solid #2c2940;"></div>
  </div>`;
}

export function script() {
  return `
  var liveMapInstance = null;
  var liveMapMarkers = {};

  function ensureLiveMap() {
    if (liveMapInstance) return liveMapInstance;
    if (typeof L === 'undefined') return null;
    liveMapInstance = L.map('liveMapContainer').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(liveMapInstance);
    return liveMapInstance;
  }

  async function loadLiveMap(token) {
    try {
      const res = await fetch('/api/admin/live-map', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('liveMapNote').textContent = 'Could not load the live map.'; return; }
      const data = await res.json();
      renderLiveMap(data.active || []);
    } catch {
      document.getElementById('liveMapNote').textContent = 'Could not reach the API.';
    }
  }

  function renderLiveMap(active) {
    document.getElementById('liveMapNote').textContent = active.length
      ? active.length + ' active ride' + (active.length === 1 ? '' : 's') + ' tracked.'
      : '';

    const emptyEl = document.getElementById('liveMapEmpty');
    const mapEl = document.getElementById('liveMapContainer');

    if (!active.length) {
      emptyEl.style.display = 'block';
      mapEl.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    mapEl.style.display = 'block';

    const map = ensureLiveMap();
    if (!map) { document.getElementById('liveMapNote').textContent = 'Map library failed to load.'; return; }
    // The container may have just gone from display:none to visible (either
    // on this very tick, or because the Live Map tab wasn't open yet while
    // this ran from the dashboard's auto-refresh) — Leaflet sizes itself off
    // the container's dimensions at the moment it last checked, so nudge it.
    setTimeout(function () { map.invalidateSize(); }, 0);

    const seen = {};
    active.forEach(function (loc) {
      seen[loc.bookingId] = true;
      const latlng = [loc.lat, loc.lng];
      let marker = liveMapMarkers[loc.bookingId];
      if (!marker) {
        marker = L.marker(latlng).addTo(map);
        liveMapMarkers[loc.bookingId] = marker;
      } else {
        marker.setLatLng(latlng);
      }
      marker.bindPopup(
        '<strong>' + escapeHtml(loc.routeLabel) + '</strong><br>' +
        '<span style="color:#666;">Updated ' + new Date(loc.updatedAt).toLocaleTimeString() + '</span>'
      );
    });

    // Drop markers for bookings that fell out of the active window (ride
    // completed, or just stopped pinging) since the last poll.
    Object.keys(liveMapMarkers).forEach(function (bookingId) {
      if (!seen[bookingId]) {
        map.removeLayer(liveMapMarkers[bookingId]);
        delete liveMapMarkers[bookingId];
      }
    });

    const bounds = L.latLngBounds(active.map(function (loc) { return [loc.lat, loc.lng]; }));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }
`;
}
