const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account, you agree to be bound by these Terms & Conditions and by our Privacy Policy. On registration, you must affirmatively accept these Terms via a checkbox before your account is created — acceptance is not implied by continued use alone.',
  },
  {
    title: '2. Description of Service',
    body: 'RideShare Genesis ("Genesis", "we", "us") operates a software platform that connects riders and drivers to arrange shared journeys. Genesis is a marketplace and matching service — it does not itself provide transportation, does not own or operate vehicles, and does not employ drivers. Drivers offering journeys are independent individuals, not agents or employees of Genesis.',
  },
  {
    title: '3. Eligibility & Account Registration',
    body: 'You must be at least 18 years old to create an account, provide accurate registration information, and keep it up to date. A driver publishing an offered journey represents that they hold a valid driving licence and that their vehicle is roadworthy and appropriately insured, where required by applicable law. Genesis does not currently independently verify this.',
  },
  {
    title: '4. User Responsibilities',
    body: 'All users agree to provide accurate journey, pricing, and preference information; treat other users respectfully and lawfully; honour bookings made in good faith, using the cancellation flow rather than simply not showing up; and not use the platform for any unlawful purpose.',
  },
  {
    title: '5. Decision DNA & Matching',
    body: 'Genesis’s matching engine ("Decision DNA") scores candidate matches across weighted factors and shows the full breakdown behind every score. A high match score is an estimate of fit, not a guarantee of ride quality, safety, or availability. Genesis does not guarantee that any request will be matched, or that any offer will receive bookings.',
  },
  {
    title: '6. Payments, Fees & Commission',
    body: 'Prices are set by the journey owner or requester and always shown with an explicit currency. Genesis may charge a commission on completed, paid bookings; the rate that applied to a given payment is fixed at the moment it is captured and will not change retroactively. The commission rate is currently 0% during an early-bird pilot period. As of this version of the Terms, real-money payment processing is in test/sandbox mode only.',
  },
  {
    title: '7. Cancellations & Refunds',
    body: 'A journey owner may cancel their published offer or request at any time before it is completed. A booking may be cancelled from any non-terminal status; seats are released back to the journey automatically. Refund eligibility for a paid, cancelled booking depends on the payment method and timing.',
  },
  {
    title: '8. Safety Centre & Emergency Disclaimer',
    body: 'The Safety Centre provides a one-tap SOS report, incident reporting, and a trusted-contact record. It is a reporting and record-keeping tool, not an emergency response service and not a substitute for contacting local emergency services directly. Genesis does not currently independently verify driver identity, vehicle condition, or insurance.',
  },
  {
    title: '9. Prohibited Conduct',
    body: 'Users must not impersonate another person or misrepresent their identity, vehicle, or credentials; harass, threaten, or discriminate against another user; circumvent the platform’s payment or matching systems for fraudulent purposes; attempt unauthorized access to another account or Genesis systems; or post false or misleading journey or profile information.',
  },
  {
    title: '10. Messaging & Communications',
    body: 'Per-booking messages are provided to help coordinate a specific trip. Genesis may access message content where reasonably necessary for safety investigations, dispute resolution, or as required by law.',
  },
  {
    title: '11. Feedback & Content',
    body: 'By submitting feedback through the in-app feedback widget or any other channel, you grant Genesis a non-exclusive, royalty-free licence to use that feedback to improve the platform.',
  },
  {
    title: '12. Disclaimers & Limitation of Liability',
    body: 'The platform is provided "as is" and "as available." Genesis is a matching and coordination platform and is not responsible for the conduct, reliability, or performance of any rider or driver, or for the condition or safety of any vehicle. To the maximum extent permitted by applicable law, Genesis’s liability arising from your use of the platform is limited as described in the full Terms document available from Genesis on request.',
  },
  {
    title: '13. Indemnification',
    body: 'You agree to indemnify and hold Genesis harmless from claims, damages, or expenses arising from your breach of these Terms, your use of the platform, or your violation of any law or third party’s rights.',
  },
  {
    title: '14. Termination & Suspension',
    body: 'Genesis may suspend or terminate an account that violates these Terms, poses a safety risk to other users, or engages in fraudulent activity. You may stop using the platform and request account deletion at any time.',
  },
  {
    title: '15. Dispute Resolution & Governing Law',
    body: 'These Terms are governed by the laws of Kenya, reflecting the platform’s Nairobi-first pilot, without prejudice to any mandatory consumer-protection rights that cannot be waived.',
  },
  {
    title: '16. Changes to These Terms',
    body: 'Genesis may update these Terms from time to time. Material changes will be notified to users in-app or by email before taking effect; continued use of the platform after changes take effect constitutes acceptance of the revised Terms.',
  },
  {
    title: '17. Contact',
    body: 'Questions about these Terms can be sent to the contact address published on the platform’s "Get in touch" page.',
  },
];

export default function TermsAndConditions() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <p className="eyebrow">Legal</p>
      <h1>Terms & Conditions</h1>
      <div className="alert alert-error" style={{ marginBottom: 24 }}>
        <strong>Draft — not final legal terms.</strong> This page reflects the platform as built and has not yet
        been reviewed or approved by legal counsel. It will be replaced with finalized terms before a public
        commercial launch.
      </div>
      {SECTIONS.map((s) => (
        <div key={s.title} style={{ marginBottom: 20 }}>
          <h3>{s.title}</h3>
          <p className="muted">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
