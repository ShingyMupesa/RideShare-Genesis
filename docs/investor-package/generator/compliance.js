const G = require('./gen.js');
const { Document } = G;

async function main() {
  const children = [
    ...G.title('Compliance Overview', 'V1 — Nairobi pilot · Data protection, payments, and regulatory posture'),
    G.draftBanner('DRAFT — NOT LEGAL ADVICE. This document was drafted from the platform’s actual implementation, not by a lawyer, and has not been reviewed by counsel. It must be reviewed and formally approved by a qualified lawyer, licensed in the relevant jurisdiction(s), before being relied upon, published, or shown to a regulator or investor as a compliance representation.'),

    G.h1('1. Purpose & Scope'),
    G.p('This overview describes the compliance-relevant design of RideShare Genesis V1 as actually built — what data is collected, how it is protected, what payment and regulatory gaps remain before a public commercial launch, and what is already implemented versus what is still roadmap. It is written for internal planning and investor due diligence, and as a starting brief for external counsel.'),

    G.h1('2. Current Operating Status'),
    G.p('RideShare Genesis V1 is a pilot-stage product, Nairobi-first, priced in Kenyan shillings by default. As of this writing:'),
    G.bullet('Card payments run through Stripe in test mode; sandbox providers (mock card, mobile money, wallet, cash) are used for card/mobile-money/wallet flows. No real money has moved through the platform.'),
    G.bullet('Driver identity, vehicle documentation, and insurance are not yet verified by the platform.'),
    G.bullet('The platform commission defaults to 0% for an initial cohort.'),
    G.p('These facts materially change which compliance obligations are live today versus which apply only once real payments and a public commercial launch begin — this document flags both.'),

    G.h1('3. Data Protection'),
    G.h2('3.1 Applicable frameworks'),
    G.p('Given the Nairobi-first pilot, the Kenya Data Protection Act, 2019 (and its regulations, enforced by the Office of the Data Protection Commissioner, ODPC) is the primary framework in scope. If the platform expands to users outside Kenya, GDPR-aligned principles (lawful basis, purpose limitation, data minimisation, subject rights) should be treated as the design baseline regardless of exact jurisdiction, since the platform is already built around those principles by default.'),
    G.h2('3.2 Data collected'),
    G.bullet('Account data: name, email, phone (optional), password hash — never plaintext'),
    G.bullet('Profile data: bio, home city, ride preferences, Decision DNA weights, trusted emergency contact'),
    G.bullet('Journey data: origin/destination coordinates and labels, departure time, price, preferences — a requested journey’s exact coordinates are private to its owner and redacted from any general listing shown to other users'),
    G.bullet('Payment metadata: amount, currency, method, commission rate — no card numbers are collected or stored by the platform; card entry for the Stripe flow happens client-side via Stripe Elements and never touches Genesis servers'),
    G.bullet('Safety data: SOS/incident reports, emergency contact details — returned only to the authenticated owner of that profile'),
    G.bullet('Operational analytics: page views and CTA clicks for product/marketing measurement'),
    G.h2('3.3 Protections already implemented'),
    G.bullet('Passwords hashed with bcrypt; password-reset tokens are single-use, time-limited, and only ever stored as a hash'),
    G.bullet('All mutating API routes require a verified, signed session token; ownership is checked at the route layer for every sensitive action'),
    G.bullet('A private journey request’s coordinates and owner identity are never exposed to another user in a listing view — only route labels and trip terms are'),
    G.bullet('Rate limiting on authentication, password reset, and public-facing endpoints to blunt credential-stuffing and abuse'),
    G.bullet('An immutable audit trail behind bookings, payments, and safety actions'),
    G.bullet('The admin dashboard is gated behind a token and escapes all user-submitted content before display, to prevent stored cross-site-scripting from becoming an admin-credential-theft path'),
    G.h2('3.4 Not yet implemented (roadmap)'),
    G.bullet('A published, user-facing Privacy Policy (this document is an internal overview, not that policy)'),
    G.bullet('A formal, self-service data subject access/deletion/correction request flow'),
    G.bullet('A defined data retention and deletion schedule'),
    G.bullet('Registration with the ODPC as a data controller/processor, if required based on final legal advice'),
    G.h2('3.5 Third-party processors'),
    G.table(
      ['Processor', 'What is shared', 'Purpose'],
      [
        ['Cloudflare (Workers, D1, Durable Objects)', 'All application data', 'Hosting, database, and real-time infrastructure'],
        ['Stripe', 'Payment amount, currency; card details handled entirely by Stripe, never by Genesis', 'Card payment processing (currently test mode)'],
        ['Resend', 'Recipient email address, password-reset link', 'Transactional email delivery'],
        ['Anthropic (optional)', 'The user’s own Decision DNA weights, and their assistant question text', 'Optional AI-gateway enrichment of the in-app assistant; never a hard dependency'],
      ],
      [3000, 3600, 2600],
    ),

    G.h1('4. Payments & Financial Compliance'),
    G.h2('4.1 Current state'),
    G.p('No real payment processing is live. Stripe is integrated in test mode; all other payment methods (mobile money, wallet, cash) are sandboxed simulations that authorize and capture without moving real funds.'),
    G.h2('4.2 Path to production'),
    G.bullet('Integrate a licensed payment processor for the relevant jurisdiction(s) (Stripe’s live mode, once account verification is complete, or a Kenya-licensed mobile-money aggregator for M-Pesa-style flows)'),
    G.bullet('Card data never touches Genesis servers (Stripe Elements handles entry directly), which meaningfully reduces PCI-DSS scope — this should still be confirmed formally against whichever processor is used in production'),
    G.bullet('Define a KYC/AML approach for driver payouts once real money moves through the platform — not yet designed'),
    G.bullet('Confirm whether the platform’s commission structure requires a money-transmitter or payment-facilitator licence in the operating jurisdiction — this is a legal question, not an engineering one, and should go to counsel before commission is turned on for real payments'),

    G.h1('5. Transport / Ride-hailing Regulatory Considerations'),
    G.p('Kenya regulates e-hailing and ride-hailing services through the National Transport and Safety Authority (NTSA), covering driver licensing, vehicle inspection/roadworthiness, and insurance. None of this is currently verified or enforced by the platform — a driver can publish an offered journey without the platform confirming their licence, vehicle condition, or insurance status.'),
    G.bullet('Driver identity and licence verification is on the roadmap but not built'),
    G.bullet('Vehicle insurance is not confirmed by the platform; Section 8 of the Safety Centre disclaimer in the draft Terms & Conditions reflects this gap explicitly'),
    G.bullet('Legal counsel should confirm whether RideShare Genesis, as a carpooling/ride-matching marketplace rather than a dispatch taxi service, falls inside or outside NTSA’s e-hailing regulations as currently drafted, before a public commercial launch'),

    G.h1('6. Platform Security Controls'),
    G.p('Summarised from the repository’s docs/SECURITY.md, which is the authoritative technical reference:'),
    G.bullet('Stateless JWT sessions, no hardcoded fallback signing key — the server refuses to start without one configured'),
    G.bullet('Server-side authorization checks on every sensitive action, independent of what the client sends'),
    G.bullet('An explicit, server-enforced booking state machine — invalid state transitions are rejected regardless of client input'),
    G.bullet('Parameterized SQL throughout — no string-built queries'),
    G.bullet('The optional AI integration is never a hard dependency and falls back to deterministic rule-based answers on any failure'),

    G.h1('7. Incident Response'),
    G.p('An immutable audit trail (audit_events) already gives a queryable record of sensitive actions for after-the-fact investigation. A formal, written incident response plan — who is notified, within what timeframe, and what a user-facing breach notification looks like — has not yet been drafted and should be produced alongside the Privacy Policy before public launch.'),

    G.h1('8. Outstanding Compliance Work Before Public Commercial Launch'),
    G.numbered('Form the operating legal entity and confirm its registered jurisdiction(s)'),
    G.numbered('Engage counsel to review and finalise the Terms & Conditions and a published Privacy Policy'),
    G.numbered('Confirm ODPC registration requirements under the Kenya Data Protection Act, 2019'),
    G.numbered('Select and integrate a licensed payment processor for live-mode payments; define the KYC/AML approach for driver payouts'),
    G.numbered('Confirm the platform’s regulatory status with NTSA and design a driver verification (licence, vehicle, insurance) flow before allowing real trips'),
    G.numbered('Draft a formal incident response and breach notification plan'),
    G.numbered('Define a data retention and deletion schedule and build the self-service data-subject-request flow'),

    G.footerNote('This document reflects the platform as implemented at the time of writing. It is not legal advice and must not be treated as a substitute for review by qualified counsel.'),
  ];

  const doc = new Document({ styles: G.baseStyles, numbering: G.numbering, sections: [{ properties: {}, children }] });
  await G.write(doc, 'RideShare-Genesis-Compliance-Overview.docx');
}

main().catch((e) => { console.error(e); process.exit(1); });
