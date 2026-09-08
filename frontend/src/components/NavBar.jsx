import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();

  const links = [
    { to: '/browse', label: t('nav.browse') },
    { to: '/find', label: t('nav.find') },
    { to: '/offer', label: t('nav.offer') },
    { to: '/my-journeys', label: t('nav.myJourneys') },
    { to: '/safety', label: t('nav.safety') },
  ];

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar__brand">
        <img src="/brand-mark.png" alt="" width="28" height="28" className="navbar__mark" />
        RideShare Genesis
      </NavLink>
      <nav className="navbar__links">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {link.label}
          </NavLink>
        ))}
        {user ? (
          <>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
              {user.fullName?.split(' ')[0] || 'Profile'}
            </NavLink>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              {t('nav.logout')}
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">{t('nav.login')}</NavLink>
            <NavLink to="/register" className="btn btn-primary btn-sm">
              {t('nav.signup')}
            </NavLink>
          </>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleLang}
          title={lang === 'en' ? 'Badilisha lugha kuwa Kiswahili' : 'Switch language to English'}
          aria-label="Toggle language"
        >
          {lang === 'en' ? '🇰🇪 SW' : '🇬🇧 EN'}
        </button>
      </nav>
    </header>
  );
}
