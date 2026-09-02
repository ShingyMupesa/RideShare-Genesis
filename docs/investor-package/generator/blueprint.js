const G = require('./gen.js');
const { Document, Paragraph, PageBreak } = G;

async function main() {
  const children = [
    ...G.title('Product & Technical Blueprint', 'V1 — Nairobi pilot · Prepared for internal use and investor due diligence'),

    G.h1('1. Product Overview'),
    G.p('RideShare Genesis is a human-centred, explainable ridesharing platform. Its core differentiator is Decision DNA: every match the platform suggests comes with a transparent, weighted breakdown of why it was suggested, instead of a black-box score. Riders can see and tune the weights themselves.'),
    G.p('V1 is a Nairobi-first pilot, priced in Kenyan shillings by default, built around mobile money as a first-class payment method rather than a retrofitted afterthought.'),

    G.h1('2. Feature Set (Shipped in V1)'),
    G.table(
      ['Area', 'What is implemented'],
      [
        ['Authentication', 'Register/login (JWT + bcrypt), protected routes, self-service password reset via email, show/hide password toggle'],
        ['Profile', 'Bio, ride preferences, tunable Decision DNA weights, preferred payment method, trusted emergency contact'],
        ['Find / Offer a Journey', 'Request a ride scored against active offers in real time; publish a ride with seats, price, currency, and preferences'],
        ['Browse', 'Public listing of available offered and requested journeys, so a free driver can see demand and post a matching offer'],
        ['Matching engine', 'Explainable, weighted scoring across six factors (see Section 5)'],
        ['Booking workflow', 'REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED state machine, cancellable throughout; journeys are independently cancellable by their owner'],
        ['Payments', 'Card / mobile money / wallet / cash via a common sandboxed provider contract, plus a real Stripe (test mode) card option; currency is mandatory and explicit on every transaction, never defaulted'],
        ['Messaging', 'Per-booking real-time threads'],
        ['My Journeys', 'Dashboard of a user’s own bookings and published journeys'],
        ['Genesis AI assistant', 'In-app assistant; deterministic rule-based answers by default, optionally enriched by the Anthropic API; detects search/offer intent and links straight to the relevant page'],
        ['Feedback widget', 'No-login-required feedback form on every page, feeding the admin dashboard'],
        ['Safety Centre', 'One-tap SOS, incident reporting, trusted contact, case history'],
        ['Governance', 'Full audit trail behind every sensitive state change'],
        ['Environmental impact', 'Vehicle-occupancy-and-fuel-type factor in Decision DNA, an estimated CO2e/fuel/vehicle-km figure on every completed booking, and a platform-wide impact tile in the admin dashboard'],
        ['Admin dashboard', 'Password-token-gated live metrics (page views, signups, bookings, revenue by currency, environmental impact, feedback), auto-refreshing every 7 seconds'],
      ],
      [2400, 7200],
    ),

    G.h1('3. System Architecture'),
    G.p('RideShare Genesis is built and maintained as two parallel, functionally-identical implementations sharing the same data schema, matching logic, and test suite:'),
    G.table(
      ['', 'Reference implementation', 'Production deployment'],
      [
        ['Runtime', 'Node.js + Express', 'Cloudflare Workers (Hono)'],
        ['Database', 'SQLite (better-sqlite3)', 'Cloudflare D1'],
        ['Real-time chat', 'Socket.IO', 'A Durable Object per booking'],
        ['Frontend hosting', 'nginx (Docker) / Vite dev server', 'Served as static assets from the same Worker origin'],
        ['Used for', 'Local development, self-hosting, rapid iteration', 'The live, production instance of the app'],
      ],
      [2000, 3600, 4000],
    ),
    G.p('This dual-runtime approach means every feature is built twice, once per runtime, and both are covered by the same 39-test automated suite before either ships — the production Workers deployment is never a stripped-down or lagging version of the reference implementation.'),

    G.h1('4. Data Model'),
    G.p('Core tables, present in both the SQLite reference schema and the D1 production schema:'),
    G.bullet('users, profiles — accounts, preferences, and per-rider Decision DNA weights'),
    G.bullet('journeys — offered and requested trips (origin, destination, time, seats, price, currency, preferences, vehicle type)'),
    G.bullet('matches — scored offer/request pairings with a stored Decision DNA breakdown'),
    G.bullet('bookings — the booking state machine and its status history'),
    G.bullet('payments — one row per payment attempt, storing the commission rate that applied at the time of capture'),
    G.bullet('messages — per-booking chat history'),
    G.bullet('safety_cases — SOS and incident reports, with resolution state'),
    G.bullet('audit_events — an immutable log of sensitive state changes, for accountability and incident investigation'),
    G.bullet('page_events, feedback, password_resets — product-analytics, public feedback, and password-reset-token tables, self-provisioned in production without a manual migration step'),

    new Paragraph({ children: [new PageBreak()] }),
    G.h1('5. Decision DNA Matching Engine'),
    G.p('Every candidate match is scored transparently across six weighted factors. The weights are never hidden — they are the rider’s own settings, shown back to them on every match.'),
    G.table(
      ['Factor', 'Default weight', 'What it measures'],
      [
        ['Proximity', '32%', 'Average origin/destination gap between request and offer'],
        ['Timing', '28%', 'How close the departure times are'],
        ['Price fit', '13%', 'How the offer price compares to the requester’s budget'],
        ['Preferences', '13%', 'Alignment on chattiness, music, smoking, pets, luggage, gender preference'],
        ['Reliability', '6%', 'Driver trip-completion history'],
        ['Environmental', '8%', 'How much of the offer vehicle’s spare capacity the match would use, plus a bonus for lower-emission vehicle types'],
      ],
      [2400, 1800, 5400],
    ),
    G.p('A rider can override these weights in their own profile; the matching engine re-scores using whatever weights the requester has set at the moment a request is made.'),

    G.h1('6. Booking Lifecycle'),
    G.p('Bookings move through an explicit, server-enforced state machine: REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED, with CANCELLED reachable from any non-terminal state. Invalid transitions (e.g. skipping straight to COMPLETED) are rejected server-side regardless of what the client sends.'),

    G.h1('7. Payments & Monetization'),
    G.p('Every payment method (card, mobile money, wallet, cash, and Stripe test-mode card) implements the same authorize/capture provider contract, so adding a licensed real-money processor later means adding one provider, not rewriting routes. Every captured payment stores the commission rate that applied at the moment it was captured, so raising the platform’s commission percentage later never rewrites the history of past transactions.'),
    G.p('The platform commission defaults to 0% for an initial early-bird cohort, to seed liquidity on a route before charging anything — this is a configuration change away from being switched on, not a rebuild. Currency is mandatory and explicit on every journey, booking, and payment; there is no silent default to a single currency.'),

    G.h1('8. Environmental Philosophy'),
    G.p('The platform states its environmental ambition and builds the capability to measure it, rather than asserting an unverified reduction figure. Five connected principles: share existing capacity, reduce unnecessary duplication, surface efficient options honestly, favour cleaner vehicles within the match score, and measure the impact on every completed trip — with the methodology always shown alongside the estimate.'),

    G.h1('9. Security & Governance Summary'),
    G.bullet('Passwords hashed with bcrypt; sessions are stateless, signed JWTs; no hardcoded fallback signing key — the server refuses to start without one configured'),
    G.bullet('Ownership/authorization checked at the route layer for every sensitive action (only a journey’s owner can cancel it, only a booking’s parties can view/act on it, etc.)'),
    G.bullet('Every write route validates its input server-side; all SQL is parameterized'),
    G.bullet('Rate limiting on login, registration, password reset, the AI assistant, and feedback submission, to blunt brute-force and cost-abuse attempts'),
    G.bullet('An immutable audit trail behind bookings, payments, and safety reports'),
    G.bullet('A password-token-gated admin dashboard with output HTML-escaped against stored-XSS'),
    G.p('See the repository’s docs/SECURITY.md for the full technical detail behind each of these controls.'),

    G.h1('10. Roadmap'),
    G.h2('Shipped'),
    G.bullet('Full V1 product across both runtimes, with 39 automated tests green'),
    G.bullet('Live production deployment on Cloudflare Workers, D1, and Durable Objects'),
    G.bullet('Environmental impact factor and estimated-impact reporting'),
    G.h2('Now'),
    G.bullet('Early-bird period at 0% commission while the first cohort of users is seeded'),
    G.h2('Next'),
    G.bullet('Real geocoding and live maps in place of manually entered coordinates'),
    G.bullet('Driver identity verification'),
    G.bullet('A licensed payment processor behind the existing provider contract'),
    G.bullet('Calibrated emission factors against real trip telemetry'),
    G.bullet('Ride Passes for repeat driver/passenger pairs, to reduce off-platform settlement'),

    G.footerNote('This document describes the product and technical state of RideShare Genesis V1 as implemented in the repository at the time of writing. It is a working reference for engineering, product, and investor due diligence, and is expected to be revised as the product evolves.'),
  ];

  const doc = new Document({
    styles: G.baseStyles,
    numbering: G.numbering,
    sections: [{ properties: {}, children }],
  });
  await G.write(doc, 'RideShare-Genesis-Blueprint.docx');
}

main().catch((e) => { console.error(e); process.exit(1); });
