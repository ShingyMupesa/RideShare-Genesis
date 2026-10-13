import { Link, useLocation } from 'react-router-dom';
import ShareInstall from '../components/ShareInstall.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const PRINCIPLES = [
  {
    icon: '🔍',
    title: 'Transparent by design',
    body: 'Every match comes with a Decision DNA explanation — you always see why Genesis suggested it.',
  },
  {
    icon: '🤝',
    title: 'People, not just routes',
    body: 'Preferences like chattiness, music, and pets matter as much as distance and price.',
  },
  {
    icon: '🛡️',
    title: 'Safety is foundational',
    body: 'One-tap SOS, incident reporting, and a full audit trail back every journey.',
  },
  {
    icon: '🎛️',
    title: 'You stay in control',
    body: 'Tune your own Decision DNA weights — Genesis adapts to what matters to you.',
  },
];

export default function Welcome() {
  const location = useLocation();
  const { t } = useLanguage();
  return (
    <div>
      {location.state?.accountDeleted && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          Your account and personal data have been deleted.
        </div>
      )}
      <section className="hero">
        <img className="hero-logo" src="/brand-logo.png" alt="RideShare Genesis logo" width="96" height="96" />
        <p className="eyebrow">{t('welcome.eyebrow')}</p>
        <h1>{t('welcome.headline')}</h1>
        <p>{t('welcome.body')}</p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/find" className="btn btn-primary">
            {t('welcome.ctaFind')}
          </Link>
          <Link to="/offer" className="btn btn-secondary">
            {t('welcome.ctaOffer')}
          </Link>
        </div>
        <div className="hero-share-install">
          <ShareInstall />
        </div>
      </section>

      <section>
        <h2 style={{ textAlign: 'center' }}>{t('welcome.principlesHeading')}</h2>
        <div className="principles-grid">
          {PRINCIPLES.map((p) => (
            <div className="principle-card" key={p.title}>
              <div className="icon">{p.icon}</div>
              <h3 style={{ margin: '8px 0 4px' }}>{p.title}</h3>
              <p className="muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 32 }}>
        <p className="eyebrow">{t('welcome.howItWorks')}</p>
        <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Tell Genesis where you're headed — as a rider requesting a seat, or a driver offering one.</li>
          <li>Genesis's matching engine scores candidates against your Decision DNA and shows its reasoning.</li>
          <li>Book your seat, choose how to pay, and message your match directly.</li>
          <li>Travel with the Safety Centre one tap away, and every step logged for accountability.</li>
        </ol>
      </section>
    </div>
  );
}
