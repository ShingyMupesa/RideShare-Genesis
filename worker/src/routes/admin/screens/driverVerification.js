// Driver verification screen: enforcement toggle, reviewer-name field,
// pending-queue table with photo-view buttons and approve/reject actions.
// Split out verbatim from the single admin.js that existed before this
// refactor — logic unchanged.

export function markup() {
  return `
  <div class="screen" id="screen-driverVerification">
    <h2 style="font-size:1rem;">Driver verification</h2>
    <p class="muted" style="margin-bottom:6px;">
      Designed and ready, but inert by default — offering a journey never requires verification until this is switched on.
      Flip it green once revenue/commission goes live and driver trust needs to be enforced.
    </p>
    <p class="muted" style="margin-bottom:6px; font-size:0.78rem;">
      Tier 1 (live): real license and insurance photos, checked to be genuine images before storage — but reviewed by human judgement, not
      automated ID verification. Tier 2/3 (paid ID-verification API + government license lookup) is planned once the 10%
      commission is in effect.
    </p>
    <div class="toggle-row">
      <label class="toggle-switch">
        <input type="checkbox" id="dvEnforceToggle">
        <span class="toggle-slider"></span>
      </label>
      <span id="dvEnforceLabel" class="muted"></span>
    </div>
    <div class="toggle-row" style="margin-top:-8px;">
      <label class="muted" for="dvReviewerName" style="font-size:0.8rem;">Reviewing as:</label>
      <input type="text" id="dvReviewerName" class="reviewer-input" placeholder="Your name" style="width:160px;">
    </div>
    <p class="muted" id="dvQueueNote" style="margin-bottom:10px;">Loading…</p>
    <div class="table-wrap">
    <table id="dvQueueTable">
      <thead><tr><th>Applicant</th><th>License</th><th>Vehicle</th><th>Documents</th><th>Submitted</th><th>Action</th></tr></thead>
      <tbody></tbody>
    </table>
    </div>
  </div>`;
}

export function script() {
  return `
  function reviewerName() {
    return document.getElementById('dvReviewerName').value.trim() || 'admin';
  }

  async function loadDriverVerification(token) {
    const toggle = document.getElementById('dvEnforceToggle');
    const label = document.getElementById('dvEnforceLabel');
    try {
      const settingsRes = await fetch('/api/driver-verification/settings');
      const settings = await settingsRes.json();
      toggle.checked = !!settings.enforced;
      label.textContent = settings.enforced
        ? 'Enforced — unverified drivers are blocked from posting offers.'
        : 'Off — driver verification is tracked but never blocks posting yet.';
    } catch {
      label.textContent = 'Could not load enforcement setting.';
    }

    try {
      const queueRes = await fetch('/api/driver-verification/queue?status=pending', { headers: { 'x-admin-token': token } });
      if (!queueRes.ok) { document.getElementById('dvQueueNote').textContent = 'Could not load the review queue.'; return; }
      const data = await queueRes.json();
      renderDriverQueue(data.submissions, token);
    } catch {
      document.getElementById('dvQueueNote').textContent = 'Could not load the review queue.';
    }
  }

  function renderDriverQueue(submissions, token) {
    document.getElementById('dvQueueNote').textContent = submissions.length
      ? submissions.length + ' pending submission(s).'
      : 'No pending submissions.';
    const body = document.querySelector('#dvQueueTable tbody');
    body.innerHTML = submissions.map(function (s) {
      const docButtons =
        (s.license_photo_key ? '<button class="btn-tiny btn-neutral" data-view="license">License photo</button>' : '<span class="muted">No license photo</span>') +
        (s.vehicle_reg_photo_key ? '<button class="btn-tiny btn-neutral" data-view="vehicleReg">Reg photo</button>' : '') +
        (s.insurance_photo_key ? '<button class="btn-tiny btn-neutral" data-view="insurance">Insurance photo</button>' : '<span class="muted">No insurance photo</span>');
      return '<tr data-id="' + s.id + '">' +
        '<td>' + escapeHtml(s.applicant_name) + '<br><span class="muted">' + escapeHtml(s.applicant_email) + '</span></td>' +
        '<td>' + escapeHtml(s.license_number) + (s.license_expiry ? '<br><span class="muted">exp ' + escapeHtml(s.license_expiry) + '</span>' : '') + '</td>' +
        '<td>' + escapeHtml(s.vehicle_make_model || '—') + '<br><span class="muted">' + escapeHtml(s.vehicle_plate) + '</span>' +
          (s.insurance_policy_number ? '<br><span class="muted">ins. ' + escapeHtml(s.insurance_policy_number) + (s.insurance_expiry ? ' (exp ' + escapeHtml(s.insurance_expiry) + ')' : '') + '</span>' : '') +
        '</td>' +
        '<td>' + docButtons + '</td>' +
        '<td>' + new Date(s.submitted_at).toLocaleString() + '</td>' +
        '<td><button class="btn-tiny btn-approve" data-action="approve">Approve</button><button class="btn-tiny btn-reject" data-action="reject">Reject</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" style="color:#9490ab;">No pending submissions.</td></tr>';

    body.querySelectorAll('button[data-view]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const which = btn.getAttribute('data-view');
        btn.disabled = true;
        try {
          const res = await fetch('/api/driver-verification/' + id + '/photo/' + which, { headers: { 'x-admin-token': token } });
          if (!res.ok) { alert('Could not load that photo.'); return; }
          const blob = await res.blob();
          window.open(URL.createObjectURL(blob), '_blank', 'noopener');
        } catch {
          alert('Could not reach the API.');
        } finally {
          btn.disabled = false;
        }
      });
    });

    body.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.closest('tr').getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        let reviewNote = null;
        if (action === 'reject') {
          reviewNote = prompt('Reason for rejecting this submission (shown to the driver):');
          if (!reviewNote || !reviewNote.trim()) return;
        }
        btn.disabled = true;
        try {
          const res = await fetch('/api/driver-verification/' + id + '/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
            body: JSON.stringify({ reviewerName: reviewerName(), reviewNote: reviewNote }),
          });
          if (!res.ok) { alert('Could not ' + action + ' this submission.'); btn.disabled = false; return; }
          loadDriverVerification(token);
        } catch {
          alert('Could not reach the API.');
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById('dvEnforceToggle').addEventListener('change', async function (e) {
    const token = getToken();
    if (!token) return;
    const next = e.target.checked;
    e.target.disabled = true;
    try {
      const res = await fetch('/api/driver-verification/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ enforced: next }),
      });
      if (!res.ok) { e.target.checked = !next; alert('Could not update the setting.'); }
      else {
        document.getElementById('dvEnforceLabel').textContent = next
          ? 'Enforced — unverified drivers are blocked from posting offers.'
          : 'Off — driver verification is tracked but never blocks posting yet.';
      }
    } catch {
      e.target.checked = !next;
      alert('Could not reach the API.');
    } finally {
      e.target.disabled = false;
    }
  });
`;
}
