// Ad slots screen: a CRUD table for admin-defined ad placements. Follows the
// exact markup()/script() shape of the other screens/*.js files.

export function markup() {
  return `
  <div class="screen" id="screen-adSlots">
    <h2 style="font-size:1rem;">Ad slots</h2>
    <p class="muted" style="margin-bottom:6px;">
      Designed and ready, but inert by default — these are placement records an admin can define, not a live ad
      network. There is no ad-serving integration anywhere in this codebase: nothing reads these rows to actually
      show an ad to a rider or driver yet.
    </p>
    <div class="grid" id="adSlotsStatGrid"></div>

    <div id="adSlotFormWrap" style="border:1px solid #2c2940; border-radius:10px; padding:14px 16px; margin:12px 0;">
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="adSlotPlacement" class="reviewer-input" placeholder="Placement (e.g. booking_confirmation)" style="width:220px;">
        <input type="text" id="adSlotName" class="reviewer-input" placeholder="Name" style="width:160px;">
      </div>
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="adSlotCreativeUrl" class="reviewer-input" placeholder="Creative URL" style="width:220px;">
        <input type="text" id="adSlotTargetUrl" class="reviewer-input" placeholder="Target URL" style="width:220px;">
      </div>
      <div class="toggle-row" style="margin:0 0 8px;">
        <label class="muted" style="font-size:0.78rem;">Starts<input type="date" id="adSlotStartsAt" class="reviewer-input" style="margin-left:4px;"></label>
        <label class="muted" style="font-size:0.78rem;">Ends<input type="date" id="adSlotEndsAt" class="reviewer-input" style="margin-left:4px;"></label>
      </div>
      <div class="toggle-row" style="margin:0;">
        <label class="muted" style="font-size:0.8rem;"><input type="checkbox" id="adSlotActive" style="margin-right:4px;">Active</label>
        <button class="btn-tiny btn-primary" id="adSlotSaveBtn">Create ad slot</button>
        <button class="btn-tiny btn-neutral" id="adSlotCancelEditBtn" style="display:none;">Cancel edit</button>
        <span class="muted" id="adSlotFormStatus" style="font-size:0.78rem;"></span>
      </div>
    </div>

    <p class="muted" id="adSlotsNote" style="margin:10px 0;">Loading…</p>
    <div class="table-wrap">
    <table id="adSlotsTable">
      <thead><tr><th>Placement</th><th>Name</th><th>Window</th><th>Status</th><th>Action</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
  </div>`;
}

export function script() {
  return `
  var adSlotEditingId = null;

  function adSlotFormValues() {
    return {
      placement: document.getElementById('adSlotPlacement').value.trim(),
      name: document.getElementById('adSlotName').value.trim(),
      creativeUrl: document.getElementById('adSlotCreativeUrl').value.trim() || null,
      targetUrl: document.getElementById('adSlotTargetUrl').value.trim() || null,
      startsAt: document.getElementById('adSlotStartsAt').value || null,
      endsAt: document.getElementById('adSlotEndsAt').value || null,
      active: document.getElementById('adSlotActive').checked,
    };
  }

  function resetAdSlotForm() {
    adSlotEditingId = null;
    document.getElementById('adSlotPlacement').value = '';
    document.getElementById('adSlotName').value = '';
    document.getElementById('adSlotCreativeUrl').value = '';
    document.getElementById('adSlotTargetUrl').value = '';
    document.getElementById('adSlotStartsAt').value = '';
    document.getElementById('adSlotEndsAt').value = '';
    document.getElementById('adSlotActive').checked = false;
    document.getElementById('adSlotSaveBtn').textContent = 'Create ad slot';
    document.getElementById('adSlotCancelEditBtn').style.display = 'none';
  }

  function startEditAdSlot(slot) {
    adSlotEditingId = slot.id;
    document.getElementById('adSlotPlacement').value = slot.placement;
    document.getElementById('adSlotName').value = slot.name;
    document.getElementById('adSlotCreativeUrl').value = slot.creativeUrl || '';
    document.getElementById('adSlotTargetUrl').value = slot.targetUrl || '';
    document.getElementById('adSlotStartsAt').value = slot.startsAt ? slot.startsAt.slice(0, 10) : '';
    document.getElementById('adSlotEndsAt').value = slot.endsAt ? slot.endsAt.slice(0, 10) : '';
    document.getElementById('adSlotActive').checked = !!slot.active;
    document.getElementById('adSlotSaveBtn').textContent = 'Save changes';
    document.getElementById('adSlotCancelEditBtn').style.display = 'inline-block';
  }

  async function loadAdSlots(token) {
    try {
      const res = await fetch('/api/admin/ad-slots', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('adSlotsNote').textContent = 'Could not load ad slots.'; return; }
      const data = await res.json();
      const slots = data.adSlots || [];
      renderAdSlotsStats(slots);
      renderAdSlotsTable(slots, token);
    } catch {
      document.getElementById('adSlotsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderAdSlotsStats(slots) {
    const activeCount = slots.filter(function (s) { return s.active; }).length;
    document.getElementById('adSlotsStatGrid').innerHTML =
      '<div class="stat"><div class="val">' + slots.length + '</div><div class="lbl">Slots defined</div></div>' +
      '<div class="stat"><div class="val">' + activeCount + '</div><div class="lbl">Marked active</div></div>';
  }

  function renderAdSlotsTable(slots, token) {
    document.getElementById('adSlotsNote').textContent = slots.length ? slots.length + ' ad slot(s) on file.' : 'No ad slots defined yet.';
    const body = document.querySelector('#adSlotsTable tbody');
    body.innerHTML = slots.map(function (s) {
      const window = (s.startsAt || '—') + ' → ' + (s.endsAt || '—');
      return '<tr data-id="' + s.id + '">' +
        '<td>' + escapeHtml(s.placement) + '</td>' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td>' + escapeHtml(window) + '</td>' +
        '<td>' + (s.active ? '<span class="badge badge-active">Active</span>' : '<span class="badge">Inactive</span>') + '</td>' +
        '<td><button class="btn-tiny btn-neutral" data-action="edit">Edit</button>' +
          (s.active ? '<button class="btn-tiny btn-reject" data-action="deactivate">Deactivate</button>' : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">No ad slots defined yet.</td></tr>';

    body.querySelectorAll('button[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const slot = slots.find(function (s) { return s.id === id; });
        if (slot) startEditAdSlot(slot);
      });
    });
    body.querySelectorAll('button[data-action="deactivate"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        if (!confirm('Deactivate this ad slot?')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/ad-slots/' + id, { method: 'DELETE', headers: { 'x-admin-token': token } });
          if (!res.ok) { alert('Could not deactivate this ad slot.'); btn.disabled = false; return; }
          loadAdSlots(token);
        } catch {
          alert('Could not reach the API.');
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById('adSlotSaveBtn').addEventListener('click', async function () {
    const token = getToken();
    if (!token) return;
    const values = adSlotFormValues();
    if (!values.placement || !values.name) { document.getElementById('adSlotFormStatus').textContent = 'Placement and name are required.'; return; }
    const btn = document.getElementById('adSlotSaveBtn');
    btn.disabled = true;
    document.getElementById('adSlotFormStatus').textContent = 'Saving…';
    try {
      const url = adSlotEditingId ? '/api/admin/ad-slots/' + adSlotEditingId : '/api/admin/ad-slots';
      const method = adSlotEditingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(values),
      });
      if (!res.ok) { document.getElementById('adSlotFormStatus').textContent = 'Could not save this ad slot.'; btn.disabled = false; return; }
      resetAdSlotForm();
      loadAdSlots(token);
    } catch {
      document.getElementById('adSlotFormStatus').textContent = 'Could not reach the API.';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('adSlotCancelEditBtn').addEventListener('click', resetAdSlotForm);
`;
}
