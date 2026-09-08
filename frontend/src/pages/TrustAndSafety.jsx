import { Link } from 'react-router-dom';

const SECTIONS = [
  {
    title: 'Verified Driver review',
    body: "Before a driver's \"Verified Driver\" badge appears anywhere — their profile, every journey they post — an admin reviews their driving licence, vehicle registration, and insurance, each submitted as a photo and checked for basic authenticity (a real, matching image, not a blank or corrupted upload) before it ever reaches a reviewer. Vehicle registration is optional; licence and insurance are required. A driver can be verified, pending, or rejected (with a reviewer note explaining why), and can resubmit at any time.",
  },
  {
    title: 'What the badge means today — and what it doesn\'t yet',
    body: 'A "Verified Driver" badge means Genesis has reviewed the documents above. It does not yet mean an independent government or insurer database has confirmed them — that deeper check (automated ID verification, a licensing-authority lookup) is a deliberately deferred, revenue-gated build, not something silently skipped. Posting a journey does not currently require verification; a platform-wide toggle controls whether it will, and it is off by default until Genesis decides enforcement should start.',
  },
  {
    title: 'Safety Centre',
    body: 'Every user has access to a Safety Centre: one-tap SOS that logs an incident immediately and shares it with a trusted emergency contact, and a report form for anything from a safety concern to general feedback. Every SOS and report is timestamped and kept in a permanent audit trail — nothing filed there is ever silently dropped. Visit the Safety Centre to trigger SOS or file a report.',
    link: { to: '/safety', label: 'Open the Safety Centre' },
  },
  {
    title: 'Payments',
    body: 'Genesis never holds a rider or driver\'s money as a wallet balance. Every payment routes through a licensed payment processor — Stripe for cards, Safaricom\'s Daraja API for M-Pesa — the same instant a booking is paid for. There is no pool of user funds sitting inside the platform for Genesis to hold, lose, or misuse.',
  },
  {
    title: 'Your data',
    body: 'What Genesis collects, why, who it\'s shared with, and how to have it deleted — including a self-service path that doesn\'t require logging in — is covered in full in the Privacy Policy, not summarised again here.',
    link: { to: '/privacy', label: 'Read the Privacy Policy' },
  },
  {
    title: 'Reporting a concern outside the app',
    body: 'If something needs attention before you can log in — or you\'d rather not use the in-app report form — reach out on WhatsApp using the link in the footer of every page. It goes to a real person, not a queue.',
  },
  {
    title: 'Where this is still incomplete',
    body: 'Named plainly, not glossed over: Genesis has not yet completed Kenyan business registration or an independent legal opinion on whether it operates as carpooling or regulated e-hailing, which is what ultimately decides whether driver insurance is a legal requirement rather than a platform review step. None of this blocks using the app today, but it is the honest, current state — not a settled one.',
  },
];

export default function TrustAndSafety() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <p className="eyebrow">Trust &amp; Safety</p>
      <h1>How Genesis keeps this honest</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 24 }}>
        Every claim below is checked against what the platform actually does, not a promise about what it will do
        someday.
      </p>
      {SECTIONS.map((s) => (
        <div key={s.title} style={{ marginBottom: 20 }}>
          <h3>{s.title}</h3>
          <p className="muted">{s.body}</p>
          {s.link && <Link to={s.link.to}>{s.link.label} →</Link>}
        </div>
      ))}
    </div>
  );
}
