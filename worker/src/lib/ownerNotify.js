import { sendEmail } from './resend.js';
import { getOwnerContact } from './adminTeam.js';

// Emails the platform Owner (resolved from the pinned owner account — see
// lib/adminTeam.js — so the address is never hard-coded in the repo).
// Fire-and-forget via waitUntil: a Resend outage must never fail the
// user's own request. Never put document photos or secrets in these
// emails; they link to the admin dashboard, which requires sign-in.

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function ownerEmailHtml({ heading, intro, rows = [], ctaUrl, ctaLabel }) {
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6a6883;">${escapeHtml(k)}</td><td style="padding:4px 0;"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join('');
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1c1b2e;">
      <h2 style="color:#5b4cff;">RideShare Genesis — ${escapeHtml(heading)}</h2>
      <p>${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;margin:12px 0;">${table}</table>
      <p><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#5b4cff;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>
      <p style="color:#6a6883;font-size:0.85rem;">You are receiving this because you are the Owner of RideShare Genesis. The link opens the admin dashboard, which asks you to sign in.</p>
    </div>`;
}

export function notifyOwner(c, { subject, html }) {
  const task = (async () => {
    const owner = await getOwnerContact(c.env.DB, c.env);
    if (!owner?.email) {
      console.warn('[owner-notify] No owner configured; skipped:', subject);
      return;
    }
    if (!c.env.RESEND_API_KEY) {
      console.warn('[owner-notify] RESEND_API_KEY not configured; skipped:', subject);
      return;
    }
    await sendEmail({
      to: owner.email,
      subject,
      html,
      apiKey: c.env.RESEND_API_KEY,
      from: c.env.EMAIL_FROM || 'RideShare Genesis <onboarding@resend.dev>',
    });
  })().catch((err) => console.error('[owner-notify] failed:', err.message));
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // no execution context (tests) — the promise still runs
  }
  return task;
}

export function appOrigin(c) {
  return c.env.APP_URL || new URL(c.req.url).origin;
}
