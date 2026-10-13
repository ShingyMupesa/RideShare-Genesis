import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import ShareInstall from './ShareInstall.jsx';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, toggleLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  const links = [
    { to: '/browse', label: t('nav.browse') },
    { to: '/find', label: t('nav.find') },
    { to: '/offer', label: t('nav.offer') },
    { to: '/my-journeys', label: t('nav.myJourneys') },
    { to: '/safety', label: t('nav.safety') },
  ];

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) closeMenu();
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="navbar" ref={navRef}>
      <NavLink to="/" className="navbar__brand">
        <img src="/brand-mark.png" alt="" width="28" height="28" className="navbar__mark" />
        RideShare Genesis
      </NavLink>
      <button
        type="button"
        className="navbar__toggle"
        aria-label="Toggle menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        aria-controls="navbar-menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav id="navbar-menu" className={`navbar__links${menuOpen ? ' navbar__links--open' : ''}`}>
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
        <div className="navbar__mobile-actions">
          <p className="navbar__menu-label">Get the app</p>
          <ShareInstall variant="menu" onNavigate={closeMenu} />
        </div>
      </nav>
    </header>
  );
}
