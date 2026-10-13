import { Link } from 'react-router-dom';

const SECTIONS = [
  {
    title: '1. What this covers',
    body: 'This Privacy Policy explains what RideShare Genesis ("Genesis", "we", "us") collects, why, who it\'s shared with, and how to have it deleted. It applies to the web app and the Android app, which are the same application.',
  },
  {
    title: '2. Information you provide',
    body: 'Name, email address, and phone number when you register. Journey details (pickup and drop-off points, timing, price, preferences) when you find or offer a journey. For drivers who submit verification: full legal name, driving licence number and photo, vehicle registration and photo, and insurance policy details and photo. Messages you send to a matched rider or driver. Content of any safety report or feedback you file.',
  },
  {
    title: '3. Information collected automatically',
    body: 'In-app actions (bookings made, verification submitted, safety reports filed) are logged for analytics and fraud prevention. If you enable push notifications, your browser or device registers a subscription endpoint with us so we can deliver them — this is standard Web Push infrastructure and is not a location or advertising identifier.',
  },
  {
    title: '4. Payment information',
    body: 'Paying by M-Pesa shares your phone number and the payment amount with Safaricom\'s Daraja API to process the transaction. Paying by card is handled directly by Stripe — your card number is never received or stored by Genesis\'s own servers. Booking and payment records are kept for financial reconciliation and fraud investigation, even after an account is deleted (see section 8).',
  },
  {
    title: '5. Who we share data with',
    body: 'Safaricom (M-Pesa) and Stripe, strictly to process a payment you initiate. Resend, to deliver transactional email (password resets, deletion confirmations). Driver verification documents are seen only by Genesis administrators reviewing that submission — never sold, never shared with advertisers, never used to train third-party models.',
  },
  {
    title: '6. Location data',
    body: 'Pickup and drop-off coordinates you enter for a journey are used by the matching engine to find and rank candidate matches. A "request" journey\'s exact coordinates stay private to you until a match is made — anyone else browsing sees only the route\'s general labels, never your precise pickup point.',
  },
  {
    title: '7. Security',
    body: 'Traffic to and from Genesis is encrypted in transit (HTTPS/TLS). Data at rest is encrypted by our infrastructure provider by default. Passwords are never stored in plain text. Access to driver verification documents requires either being the submitter or an authenticated administrator — there is no public URL for them.',
  },
  {
    title: '8. Deleting your account',
    body: 'You can delete your account at any time from your Profile page, or without logging in at ridesharegenesis.app/data-deletion. Deletion permanently removes your name, email, phone number, and driver verification documents (including the underlying photos). Bookings, payments, and message history are kept — anonymised, no longer linked to your name or contact details — because other users have a legitimate record of a trip or conversation that happened, and because financial records need to be retrievable for reconciliation, tax, and fraud investigation. A session token issued before deletion can remain technically valid for up to 7 days (its normal expiry) but has nothing left to show beyond an anonymised profile.',
  },
  {
    title: '9. Children',
    body: 'Genesis is not directed at children. You must be at least 18 years old to create an account.',
  },
  {
    title: '10. Changes to this policy',
    body: 'Material changes will be notified in-app or by email before taking effect.',
  },
  {
    title: '11. Contact',
    body: 'Questions about this policy, or a request this page doesn\'t cover, can be sent to the contact address published on the platform.',
  },
];

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <p className="eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <div className="alert alert-error" style={{ marginBottom: 24 }}>
        <strong>Draft — not final legal terms.</strong> This page reflects the platform as built and has not yet
        been reviewed by legal counsel. It will be replaced with finalized terms before a public commercial
        launch.
      </div>
      {SECTIONS.map((s) => (
        <div key={s.title} style={{ marginBottom: 20 }}>
          <h3>{s.title}</h3>
          <p className="muted">{s.body}</p>
        </div>
      ))}
      <p className="muted" style={{ marginTop: 8 }}>
        Ready to delete your account? <Link to="/data-deletion">Start here</Link>.
      </p>
    </div>
  );
}
