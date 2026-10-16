import { Link } from 'react-router-dom';

const ROLE_OPTIONS = [
  {
    intent: 'driver',
    icon: '🚗',
    title: 'I have a spare seat',
    body: 'Offer your empty seats on routes you already drive and cover your costs.',
  },
  {
    intent: 'passenger',
    icon: '🙋',
    title: 'I need a seat',
    body: 'Find a driver already heading your way, matched and explained for you.',
  },
  {
    intent: 'both',
    icon: '🔁',
    title: 'Depends on the day',
    body: "Some days you drive, some days you ride — Genesis works either way.",
  },
];

export default function GetStarted() {
  return (
    <div>
      <section className="hero">
        <img className="hero-logo" src="/brand-logo.png" alt="RideShare Genesis logo" width="96" height="96" />
        <p className="eyebrow">Join Genesis</p>
        <h1>Got a spare seat — or need one?</h1>
        <p>
          Genesis matches drivers with spare seats to riders heading the same way — with full transparency on
          why every match was made.
        </p>
      </section>

      <section className="role-options">
        {ROLE_OPTIONS.map((option) => (
          <Link key={option.intent} to={`/register?intent=${option.intent}`} className="role-option">
            <div className="role-option__icon">{option.icon}</div>
            <h3>{option.title}</h3>
            <p className="muted">{option.body}</p>
            <span className="role-option__cta">Get started →</span>
          </Link>
        ))}
      </section>

      <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
        Already on Genesis? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
