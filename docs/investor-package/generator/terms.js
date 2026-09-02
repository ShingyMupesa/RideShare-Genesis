const G = require('./gen.js');
const { Document } = G;

async function main() {
  const children = [
    ...G.title('Terms & Conditions', 'V1 — Draft for legal review · Applies to all riders and drivers using RideShare Genesis'),
    G.draftBanner('DRAFT — NOT LEGAL ADVICE. This draft was generated from the platform’s actual features, in the style of a standard ridesharing-marketplace agreement, and has not been written or reviewed by a lawyer. It must be reviewed and approved by qualified counsel, licensed in the relevant jurisdiction(s), before being published or presented to users as binding terms.'),

    G.h1('1. Acceptance of Terms'),
    G.p('By creating an account, you agree to be bound by these Terms & Conditions and by our Privacy Policy. If you do not agree, do not create an account or use the platform. On registration, you must affirmatively accept these Terms via a checkbox before your account is created — acceptance is not implied by continued use alone.'),

    G.h1('2. Description of Service'),
    G.p('RideShare Genesis (“Genesis”, “we”, “us”) operates a software platform that connects riders and drivers to arrange shared journeys. Genesis is a marketplace and matching service — it does not itself provide transportation, does not own or operate vehicles, and does not employ drivers. Drivers offering journeys are independent individuals, not agents or employees of Genesis. Genesis is not a party to the transportation arrangement made between a rider and a driver.'),

    G.h1('3. Eligibility & Account Registration'),
    G.bullet('You must be at least 18 years old to create an account.'),
    G.bullet('You must provide accurate registration information and keep it up to date.'),
    G.bullet('You are responsible for maintaining the confidentiality of your password and for all activity under your account.'),
    G.bullet('A driver publishing an offered journey represents that they hold a valid driving licence and that their vehicle is roadworthy and appropriately insured for carrying passengers, where required by applicable law. Genesis does not currently independently verify this — see Section 8 (Safety Centre) and the Compliance Overview document for the current state of driver verification.'),

    G.h1('4. User Responsibilities'),
    G.p('All users agree to:'),
    G.bullet('Provide accurate journey, pricing, and preference information'),
    G.bullet('Treat other users respectfully and lawfully'),
    G.bullet('Honour bookings made in good faith, and use the cancellation flow rather than simply failing to show up'),
    G.bullet('Not use the platform for any unlawful purpose'),

    G.h1('5. Decision DNA & Matching'),
    G.p('Genesis’s matching engine (“Decision DNA”) scores candidate matches across weighted factors (proximity, timing, price, preferences, reliability, and environmental fit) and shows the full breakdown behind every score. A high match score is an estimate of fit, not a guarantee of ride quality, safety, or availability. Genesis does not guarantee that any request will be matched, or that any offer will receive bookings.'),

    G.h1('6. Payments, Fees & Commission'),
    G.bullet('Prices are set by the journey owner (for offers) or requester (for requests) and are always shown with an explicit currency; Genesis never assumes or defaults a currency on your behalf.'),
    G.bullet('Genesis may charge a commission on completed, paid bookings. The commission rate that applied to a given payment is fixed at the moment that payment is captured and will not change retroactively even if the platform’s rate changes later. The commission rate is currently 0% during an early-bird pilot period.'),
    G.bullet('As of this draft, real-money payment processing is in test/sandbox mode only — see the Compliance Overview document. Once live payment processing is enabled, this section will be updated to reflect the payment processor(s) used, applicable fees, and payout timing for drivers.'),
    G.bullet('Cash payments arranged directly between a rider and driver are outside Genesis’s payment records and are the responsibility of both parties to settle.'),

    G.h1('7. Cancellations & Refunds'),
    G.bullet('A journey owner may cancel their published offer or request at any time before it is completed.'),
    G.bullet('A booking may be cancelled from any non-terminal status; seats are released back to the journey automatically on cancellation.'),
    G.bullet('Refund eligibility for a paid, cancelled booking depends on the payment method and timing of cancellation, and will be detailed in the payment processor’s terms once live-mode payments are enabled.'),

    G.h1('8. Safety Centre & Emergency Disclaimer'),
    G.p('The Safety Centre provides a one-tap SOS report, incident reporting, and a trusted-contact record. It is a reporting and record-keeping tool, not an emergency response service and not a substitute for contacting local emergency services (police, ambulance, fire) directly. Genesis is not responsible for the physical safety of any trip and does not currently independently verify driver identity, vehicle condition, or insurance — see the Compliance Overview document for current status and roadmap.'),

    G.h1('9. Prohibited Conduct'),
    G.p('Users must not:'),
    G.bullet('Impersonate another person or misrepresent their identity, vehicle, or credentials'),
    G.bullet('Use the platform to harass, threaten, or discriminate against another user'),
    G.bullet('Circumvent the platform’s payment or matching systems for fraudulent purposes'),
    G.bullet('Attempt to gain unauthorized access to another user’s account or to the platform’s systems'),
    G.bullet('Post false, misleading, or fraudulent journey or profile information'),

    G.h1('10. Messaging & Communications'),
    G.p('Per-booking messages are provided to help coordinate a specific trip. Genesis may access message content where reasonably necessary for safety investigations, dispute resolution, or as required by law.'),

    G.h1('11. Feedback & Content'),
    G.p('By submitting feedback through the in-app feedback widget or any other channel, you grant Genesis a non-exclusive, royalty-free licence to use that feedback to improve the platform, without any obligation to compensate you or attribute the feedback to you.'),

    G.h1('12. Disclaimers & Limitation of Liability'),
    G.p('THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE." Genesis is a matching and coordination platform and is not responsible for the conduct, reliability, or performance of any rider or driver, or for the condition or safety of any vehicle. To the maximum extent permitted by applicable law, Genesis’s aggregate liability arising out of or relating to your use of the platform is limited to the amount of commission actually retained by Genesis on the specific booking giving rise to the claim, or a nominal amount if no commission was retained. This limitation is a placeholder for counsel to size appropriately against the operating jurisdiction and any applicable consumer-protection law that cannot be limited by contract.'),

    G.h1('13. Indemnification'),
    G.p('You agree to indemnify and hold Genesis harmless from claims, damages, or expenses arising from your breach of these Terms, your use of the platform, or your violation of any law or third party’s rights.'),

    G.h1('14. Termination & Suspension'),
    G.p('Genesis may suspend or terminate an account that violates these Terms, poses a safety risk to other users, or engages in fraudulent activity, with or without notice depending on severity. You may stop using the platform and request account deletion at any time.'),

    G.h1('15. Dispute Resolution & Governing Law'),
    G.p('[PLACEHOLDER — to be confirmed by counsel] These Terms are governed by the laws of Kenya, reflecting the platform’s Nairobi-first pilot. Any dispute arising under these Terms will be resolved in the courts of Kenya, or through an alternative dispute resolution mechanism to be specified by counsel, without prejudice to any mandatory consumer-protection rights that cannot be waived.'),

    G.h1('16. Changes to These Terms'),
    G.p('Genesis may update these Terms from time to time. Material changes will be notified to users in-app or by email before taking effect; continued use of the platform after changes take effect constitutes acceptance of the revised Terms.'),

    G.h1('17. Contact'),
    G.p('Questions about these Terms can be sent to the contact address published on the platform’s "Get in touch" page.'),

    G.footerNote('This draft must be reviewed, revised, and formally approved by qualified legal counsel before publication or use as binding terms.'),
  ];

  const doc = new Document({ styles: G.baseStyles, numbering: G.numbering, sections: [{ properties: {}, children }] });
  await G.write(doc, 'RideShare-Genesis-Terms-and-Conditions.docx');
}

main().catch((e) => { console.error(e); process.exit(1); });
