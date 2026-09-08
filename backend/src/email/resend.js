// Thin wrapper over Resend's REST API via fetch — no SDK dependency, so the
// same code works unchanged in the Node backend and the Workers runtime.
const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail({ to, subject, html, apiKey, from }) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || 'Failed to send email');
    err.resendError = data;
    throw err;
  }
  return data;
}

export function resetPasswordEmailHtml({ resetUrl, fullName }) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1b2e;">
      <h2 style="color:#5b4cff;">RideShare Genesis</h2>
      <p>Hi ${fullName || 'there'},</p>
      <p>Someone requested a password reset for this account. If that was you, click below to choose a new password — this link expires in 30 minutes.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#5b4cff;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Reset your password</a></p>
      <p style="color:#6a6883;font-size:0.85rem;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
}

export function confirmDeletionEmailHtml({ confirmUrl, fullName }) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1b2e;">
      <h2 style="color:#5b4cff;">RideShare Genesis</h2>
      <p>Hi ${fullName || 'there'},</p>
      <p>Someone requested deletion of this account and all its personal data. If that was you, click below to confirm — this link expires in 30 minutes and cannot be undone once confirmed.</p>
      <p><a href="${confirmUrl}" style="display:inline-block;background:#b3261e;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Permanently delete my account</a></p>
      <p style="color:#6a6883;font-size:0.85rem;">If you didn't request this, you can safely ignore this email — your account stays exactly as it is.</p>
    </div>
  `;
}
