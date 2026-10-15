// Monetisation screen: driver subscription plan CRUD (soft-delete via
// active=0) plus a read-only subscriber list with a manual admin-assignment
// form. Follows the exact markup()/script() shape of the other
// screens/*.js files.

export function markup() {
  return `
  <div class="screen" id="screen-monetisation">
    <h2 style="font-size:1rem;">Monetisation — driver subscriptions</h2>
    <p class="muted" style="margin-bottom:6px;">
      Designed and ready, but inert by default — these plans are data an admin can define and assign, not a live
      product. There is no payment processing or billing behind any of this yet: a driver is never charged, and
      nothing here moves money. Flip it on for real once a billing integration exists.
    </p>
    <p class="muted" style="margin-bottom:10px; font-size:0.78rem;">
      Subscriptions are admin-assigned only — there is no self-serve driver sign-up flow, since there is no billing
      to drive one.
    </p>
    <div class="grid" id="monetisationStatGrid"></div>

    <h3 style="font-size:0.9rem; margin-top:24px;">Plans</h3>
    <div id="planFormWrap" style="border:1px solid #2c2940; border-radius:10px; padding:14px 16px; margin:12px 0;">
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="planName" class="reviewer-input" placeholder="Plan name" style="width:160px;">
        <input type="text" id="planDescription" class="reviewer-input" placeholder="Description" style="width:220px;">
      </div>
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="number" step="0.01" id="planPrice" class="reviewer-input" placeholder="Price" style="width:100px;">
        <input type="text" id="planCurrency" class="reviewer-input" placeholder="Currency (e.g. KES)" style="width:110px;">
        <select id="planBillingPeriod" class="reviewer-input">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>
      <div class="toggle-row" style="margin:0 0 8px;">
        <input type="text" id="planPerks" class="reviewer-input" placeholder="Perks, comma-separated" style="width:320px;">
      </div>
      <div class="toggle-row" style="margin:0;">
        <label class="muted" style="font-size:0.8rem;"><input type="checkbox" id="planActive" checked style="margin-right:4px;">Active</label>
        <button class="btn-tiny" id="planSaveBtn" style="background:#7c6fef;color:#fff;">Create plan</button>
        <button class="btn-tiny" id="planCancelEditBtn" style="background:#3a3750;color:#eceaf5;display:none;">Cancel edit</button>
        <span class="muted" id="planFormStatus" style="font-size:0.78rem;"></span>
      </div>
    </div>

    <table id="plansTable">
      <thead><tr><th>Name</th><th>Price</th><th>Billing</th><th>Perks</th><th>Subscribers</th><th>Status</th><th>Action</th></tr></thead>
      <tbody></tbody>
    </table>

    <h3 style="font-size:0.9rem; margin-top:28px;">Subscriptions</h3>
    <p class="muted" id="subscriptionsNote" style="margin-bottom:10px;"></p>
    <div class="toggle-row" style="margin-bottom:10px;">
      <input type="text" id="subUserId" class="reviewer-input" placeholder="Driver user ID" style="width:220px;">
      <select id="subPlanSelect" class="reviewer-input"></select>
      <button class="btn-tiny" id="subAssignBtn" style="background:#7c6fef;color:#fff;">Assign</button>
      <span class="muted" id="subAssignStatus" style="font-size:0.78rem;"></span>
    </div>
    <table id="subscriptionsTable">
      <thead><tr><th>Driver</th><th>Plan</th><th>Status</th><th>Started</th><th>Ended</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>`;
}

export function script() {
  return `
  var planEditingId = null;
  var monetisationPlans = [];

  function planFormValues() {
    return {
      name: document.getElementById('planName').value.trim(),
      description: document.getElementById('planDescription').value.trim(),
      priceAmount: Number(document.getElementById('planPrice').value || 0),
      currency: document.getElementById('planCurrency').value.trim() || 'KES',
      billingPeriod: document.getElementById('planBillingPeriod').value,
      perks: document.getElementById('planPerks').value.split(',').map(function (p) { return p.trim(); }).filter(Boolean),
      active: document.getElementById('planActive').checked,
    };
  }

  function resetPlanForm() {
    planEditingId = null;
    document.getElementById('planName').value = '';
    document.getElementById('planDescription').value = '';
    document.getElementById('planPrice').value = '';
    document.getElementById('planCurrency').value = '';
    document.getElementById('planBillingPeriod').value = 'monthly';
    document.getElementById('planPerks').value = '';
    document.getElementById('planActive').checked = true;
    document.getElementById('planSaveBtn').textContent = 'Create plan';
    document.getElementById('planCancelEditBtn').style.display = 'none';
  }

  function startEditPlan(plan) {
    planEditingId = plan.id;
    document.getElementById('planName').value = plan.name;
    document.getElementById('planDescription').value = plan.description || '';
    document.getElementById('planPrice').value = plan.priceAmount;
    document.getElementById('planCurrency').value = plan.currency;
    document.getElementById('planBillingPeriod').value = plan.billingPeriod;
    document.getElementById('planPerks').value = (plan.perks || []).join(', ');
    document.getElementById('planActive').checked = !!plan.active;
    document.getElementById('planSaveBtn').textContent = 'Save changes';
    document.getElementById('planCancelEditBtn').style.display = 'inline-block';
  }

  async function loadMonetisation(token) {
    try {
      const res = await fetch('/api/admin/subscription-plans', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('planFormStatus').textContent = 'Could not load plans.'; return; }
      const data = await res.json();
      monetisationPlans = data.plans || [];
      renderMonetisationStats(monetisationPlans);
      renderPlansTable(monetisationPlans, token);
      renderPlanSelect(monetisationPlans);
    } catch {
      document.getElementById('planFormStatus').textContent = 'Could not reach the API.';
    }

    try {
      const res = await fetch('/api/admin/subscriptions', { headers: { 'x-admin-token': token } });
      if (!res.ok) { document.getElementById('subscriptionsNote').textContent = 'Could not load subscriptions.'; return; }
      const data = await res.json();
      renderSubscriptionsTable(data.subscriptions || []);
    } catch {
      document.getElementById('subscriptionsNote').textContent = 'Could not reach the API.';
    }
  }

  function renderMonetisationStats(plans) {
    const activePlans = plans.filter(function (p) { return p.active; }).length;
    const totalSubscribers = plans.reduce(function (sum, p) { return sum + (p.subscriberCount || 0); }, 0);
    document.getElementById('monetisationStatGrid').innerHTML =
      '<div class="stat"><div class="val">' + plans.length + '</div><div class="lbl">Plans defined</div></div>' +
      '<div class="stat"><div class="val">' + activePlans + '</div><div class="lbl">Active plans</div></div>' +
      '<div class="stat"><div class="val">' + totalSubscribers + '</div><div class="lbl">Active subscribers</div></div>';
  }

  function renderPlansTable(plans, token) {
    const body = document.querySelector('#plansTable tbody');
    body.innerHTML = plans.map(function (p) {
      return '<tr data-id="' + p.id + '">' +
        '<td>' + escapeHtml(p.name) + (p.description ? '<br><span class="muted">' + escapeHtml(p.description) + '</span>' : '') + '</td>' +
        '<td>' + escapeHtml(p.currency) + ' ' + p.priceAmount + '</td>' +
        '<td>' + escapeHtml(p.billingPeriod) + '</td>' +
        '<td>' + escapeHtml((p.perks || []).join(', ') || '—') + '</td>' +
        '<td>' + (p.subscriberCount || 0) + '</td>' +
        '<td>' + (p.active ? '<span class="badge" style="background:rgba(31,157,85,0.25);color:#6fe3a0;">Active</span>' : '<span class="badge">Inactive</span>') + '</td>' +
        '<td><button class="btn-tiny" data-action="edit" style="background:#3a3750;color:#eceaf5;">Edit</button>' +
          (p.active ? '<button class="btn-tiny btn-reject" data-action="deactivate">Deactivate</button>' : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="color:#9490ab;">No plans defined yet.</td></tr>';

    body.querySelectorAll('button[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const plan = plans.find(function (p) { return p.id === id; });
        if (plan) startEditPlan(plan);
      });
    });
    body.querySelectorAll('button[data-action="deactivate"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        if (!confirm('Deactivate this plan? Existing subscriptions to it are kept, not deleted.')) return;
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/subscription-plans/' + id, { method: 'DELETE', headers: { 'x-admin-token': token } });
          if (!res.ok) { alert('Could not deactivate this plan.'); btn.disabled = false; return; }
          loadMonetisation(token);
        } catch {
          alert('Could not reach the API.');
          btn.disabled = false;
        }
      });
    });
  }

  function renderPlanSelect(plans) {
    const select = document.getElementById('subPlanSelect');
    const current = select.value;
    select.innerHTML = plans.map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.name) + (p.active ? '' : ' (inactive)') + '</option>';
    }).join('') || '<option value="">No plans yet</option>';
    if (current) select.value = current;
  }

  function renderSubscriptionsTable(subs) {
    document.getElementById('subscriptionsNote').textContent = subs.length
      ? subs.length + ' subscription(s) on file.'
      : 'No driver has been assigned to a plan yet.';
    const body = document.querySelector('#subscriptionsTable tbody');
    body.innerHTML = subs.map(function (s) {
      return '<tr>' +
        '<td>' + escapeHtml(s.userFullName || s.userId.slice(0, 12) + '…') + '<br><span class="muted">' + escapeHtml(s.userEmail || '') + '</span></td>' +
        '<td>' + escapeHtml(s.planName) + '</td>' +
        '<td>' + escapeHtml(s.status) + '</td>' +
        '<td>' + new Date(s.startedAt).toLocaleDateString() + '</td>' +
        '<td>' + (s.endedAt ? new Date(s.endedAt).toLocaleDateString() : '—') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="5" style="color:#9490ab;">No subscriptions yet.</td></tr>';
  }

  document.getElementById('planSaveBtn').addEventListener('click', async function () {
    const token = getToken();
    if (!token) return;
    const values = planFormValues();
    if (!values.name) { document.getElementById('planFormStatus').textContent = 'Name is required.'; return; }
    const btn = document.getElementById('planSaveBtn');
    btn.disabled = true;
    document.getElementById('planFormStatus').textContent = 'Saving…';
    try {
      const url = planEditingId ? '/api/admin/subscription-plans/' + planEditingId : '/api/admin/subscription-plans';
      const method = planEditingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(values),
      });
      if (!res.ok) { document.getElementById('planFormStatus').textContent = 'Could not save this plan.'; btn.disabled = false; return; }
      resetPlanForm();
      loadMonetisation(token);
    } catch {
      document.getElementById('planFormStatus').textContent = 'Could not reach the API.';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('planCancelEditBtn').addEventListener('click', resetPlanForm);

  document.getElementById('subAssignBtn').addEventListener('click', async function () {
    const token = getToken();
    if (!token) return;
    const userId = document.getElementById('subUserId').value.trim();
    const planId = document.getElementById('subPlanSelect').value;
    if (!userId || !planId) { document.getElementById('subAssignStatus').textContent = 'User ID and plan are required.'; return; }
    const btn = document.getElementById('subAssignBtn');
    btn.disabled = true;
    document.getElementById('subAssignStatus').textContent = 'Assigning…';
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ userId: userId, planId: planId }),
      });
      if (!res.ok) { document.getElementById('subAssignStatus').textContent = 'Could not assign this subscription.'; btn.disabled = false; return; }
      document.getElementById('subUserId').value = '';
      document.getElementById('subAssignStatus').textContent = '';
      loadMonetisation(token);
    } catch {
      document.getElementById('subAssignStatus').textContent = 'Could not reach the API.';
    } finally {
      btn.disabled = false;
    }
  });
`;
}
