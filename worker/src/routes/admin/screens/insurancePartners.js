// Insurance partners screen: a CRUD table for an admin-curated directory of
// insurance partners. Follows the exact markup()/script() shape of the
// other screens/*.js files.

export function markup() {
  return `
  <div class="screen" id="screen-insurancePartners">
    <h2 style="font-size:1rem;">Insurance partners</h2>
    <p class="muted" style="margin-bottom:6px;">
      Designed and ready, but inert by default — this is a contact/product directory an admin can curate, not a live
      referral integration. There is no insurance-partner API integration anywhere in this codebase: adding a
      partner here never sends them anything or refers a driver to them automatically.
    </p>
    <div class="grid" id="insurancePartnersStatGrid"></div>

    <div id="insurancePartnerFormWrap" style="border:1px solid #2c2940; border-radius:10px; padding:14px 16px; margin:12px 0;">
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="ipName" class="reviewer-input" placeholder="Partner name" style="width:180px;">
        <input type="text" id="ipContactEmail" class="reviewer-input" placeholder="Contact email" style="width:200px;">
        <input type="text" id="ipContactPhone" class="reviewer-input" placeholder="Contact phone" style="width:140px;">
      </div>
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="ipProductDesc" class="reviewer-input" placeholder="Product description" style="width:260px;">
        <input type="text" id="ipReferralUrl" class="reviewer-input" placeholder="Referral URL" style="width:220px;">
      </div>
      <div class="toggle-row" style="margin:0;">
        <label class="muted" style="font-size:0.8rem;"><input type="checkbox" id="ipActive" style="margin-right:4px;">Active</label>
        <button class="btn-tiny btn-primary" id="ipSaveBtn">Add partner</button>
        <button class="btn-tiny btn-neutral" id="ipCancelEditBtn" style="display:none;">Cancel edit</button>
        <span class="muted" id="ipFormStatus" style="font-size:0.78rem;"></span>
      </div>
    </div>

    <p class="muted" id="insurancePartnersNote" style="margin:10px 0;">Loading…</p>
    <div class="table-wrap">
    <table id="insurancePartnersTable">
      <thead><tr><th>Partner</th><th>Contact</th><th>Product</th><th>Status</th><th>Action</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
  </div>`;
}

export function script() {
  return `
  var ipEditingId = null;

  function ipFormValues() {
    return {
      name: document.getElementById('ipName').value.trim(),
      contactEmail: document.getElementById('ipContactEmail').value.trim() || null,
      contactPhone: document.getElementById('ipContactPhone').value.trim() || null,
      productDesc: document.getElementById('ipProductDesc').value.trim() || null,
      referralUrl: document.getElementById('ipReferralUrl').value.trim() || null,
      active: document.getElementById('ipActive').checked,
    };
  }

  function resetInsurancePartnerForm() {
    ipEditingId = null;
    document.getElementById('ipName').value = '';
    document.getElementById('ipContactEmail').value = '';
    document.getElementById('ipContactPhone').value = '';
    document.getElementById('ipProductDesc').value = '';
    document.getElementById('ipReferralUrl').value = '';
    document.getElementById('ipActive').checked = false;
    document.getElementById('ipSaveBtn').textContent = 'Add partner';
    document.getElementById('ipCancelEditBtn').style.display = 'none';
  }

  function startEditInsurancePartner(partner) {
    ipEditingId = partner.id;
    document.getElementById('ipName').value = partner.name;
    document.getElementById('ipContactEmail').value = partner.contactEmail || '';
    document.getElementById('ipContactPhone').value = partner.contactPhone || '';
    document.getElementById('ipProductDesc').value = partner.productDesc || '';
    document.getElementById('ipReferralUrl').value = partner.referralUrl || '';
    document.getElementById('ipActive').checked = !!partner.active;
    document.getElementById('ipSaveBtn').textContent = 'Save changes';
    document.getElementById('ipCancelEditBtn').style.display = 'inline-block';
  }

  async function loadInsurancePartners(token) {
    try {
      const res = await fetch('/api/admin/insurance-partners', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('insurancePartnersNote').textContent = 'Could not load insurance partners.'; return; }
      const data = await res.json();
      const partners = data.insurancePartners || [];
      renderInsurancePartnersStats(partners);
      renderInsurancePartnersTable(partners, token);
    } catch {
      document.getElementById('insurancePartnersNote').textContent = 'Could not reach the API.';
    }
  }

  function renderInsurancePartnersStats(partners) {
    const activeCount = partners.filter(function (p) { return p.active; }).length;
    document.getElementById('insurancePartnersStatGrid').innerHTML =
      '<div class="stat"><div class="val">' + partners.length + '</div><div class="lbl">Partners on file</div></div>' +
      '<div class="stat"><div class="val">' + activeCount + '</div><div class="lbl">Marked active</div></div>';
  }

  function renderInsurancePartnersTable(partners, token) {
    document.getElementById('insurancePartnersNote').textContent = partners.length ? partners.length + ' partner(s) on file.' : 'No insurance partners defined yet.';
    const body = document.querySelector('#insurancePartnersTable tbody');
    body.innerHTML = partners.map(function (p) {
      const contact = [p.contactEmail, p.contactPhone].filter(Boolean).map(escapeHtml).join('<br>') || '—';
      return '<tr data-id="' + p.id + '">' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + contact + '</td>' +
        '<td>' + escapeHtml(p.productDesc || '—') + '</td>' +
        '<td>' + (p.active ? '<span class="badge badge-active">Active</span>' : '<span class="badge">Inactive</span>') + '</td>' +
        '<td><button class="btn-tiny btn-neutral" data-action="edit">Edit</button>' +
          (p.active ? '<button class="btn-tiny btn-reject" data-action="deactivate">Deactivate</button>' : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">No insurance partners defined yet.</td></tr>';

    body.querySelectorAll('button[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const partner = partners.find(function (p) { return p.id === id; });
        if (partner) startEditInsurancePartner(partner);
      });
    });
    body.querySelectorAll('button[data-action="deactivate"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        if (!confirm('Deactivate this insurance partner?')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/insurance-partners/' + id, { method: 'DELETE', headers: { 'x-admin-token': token } });
          if (!res.ok) { alert('Could not deactivate this partner.'); btn.disabled = false; return; }
          loadInsurancePartners(token);
        } catch {
          alert('Could not reach the API.');
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById('ipSaveBtn').addEventListener('click', async function () {
    const token = getToken();
    if (!token) return;
    const values = ipFormValues();
    if (!values.name) { document.getElementById('ipFormStatus').textContent = 'Name is required.'; return; }
    const btn = document.getElementById('ipSaveBtn');
    btn.disabled = true;
    document.getElementById('ipFormStatus').textContent = 'Saving…';
    try {
      const url = ipEditingId ? '/api/admin/insurance-partners/' + ipEditingId : '/api/admin/insurance-partners';
      const method = ipEditingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(values),
      });
      if (!res.ok) { document.getElementById('ipFormStatus').textContent = 'Could not save this partner.'; btn.disabled = false; return; }
      resetInsurancePartnerForm();
      loadInsurancePartners(token);
    } catch {
      document.getElementById('ipFormStatus').textContent = 'Could not reach the API.';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('ipCancelEditBtn').addEventListener('click', resetInsurancePartnerForm);
`;
}
