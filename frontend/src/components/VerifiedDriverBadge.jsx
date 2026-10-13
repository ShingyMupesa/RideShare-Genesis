// A small, reusable "Verified Driver" badge — shown wherever a driver's
// identity matters: their profile and their offer-journey posts. Renders
// nothing unless the driver has actually cleared admin review, so its mere
// presence is a real trust signal, never decorative.
export default function VerifiedDriverBadge({ style }) {
  return (
    <span
      className="verified-driver-badge"
      title="This driver's identity and vehicle details have been reviewed and approved by a RideShare Genesis admin."
      style={style}
    >
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M10 1.5l2.36 1.36 2.72-.13 1.03 2.52 2.23 1.6-.7 2.65.7 2.65-2.23 1.6-1.03 2.52-2.72-.13L10 18.5l-2.36-1.36-2.72.13-1.03-2.52-2.23-1.6.7-2.65-.7-2.65 2.23-1.6 1.03-2.52 2.72.13L10 1.5z"
          fill="currentColor"
        />
        <path d="M6.7 10.2l2.1 2.1 4.3-4.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      Verified Driver
    </span>
  );
}
