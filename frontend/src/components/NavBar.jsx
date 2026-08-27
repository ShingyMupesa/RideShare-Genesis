import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
  { to: '/find', label: 'Find a Journey' },
  { to: '/offer', label: 'Offer a Journey' },
  { to: '/my-journeys', label: 'My Journeys' },
  { to: '/safety', label: 'Safety Centre' },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar__brand">
        <span className="navbar__dot" aria-hidden="true" />
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
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register" className="btn btn-primary btn-sm">
              Sign up
            </NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
