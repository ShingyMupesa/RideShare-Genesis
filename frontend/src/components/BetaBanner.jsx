// Shown to every visitor while Genesis is in open tester/UX feedback mode —
// sets expectations up front so testers don't mistake the sandbox payment
// flows for real charges, or the Safety Centre's SOS button for a real
// emergency dispatch (it logs a case for the team; it never calls anyone).
export default function BetaBanner() {
  return (
    <div className="beta-banner" role="note">
      <strong>Early beta.</strong> Payments run in sandbox mode (no real charges) and the Safety Centre's SOS
      logs a case for our team — it does not contact emergency services. If you're in real danger, contact local
      emergency services directly.
    </div>
  );
}
