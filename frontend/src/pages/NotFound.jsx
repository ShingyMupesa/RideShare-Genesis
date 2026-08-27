import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card" style={{ textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
      <p className="eyebrow">404</p>
      <h1>We couldn't find that journey</h1>
      <p className="muted">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn btn-primary">
        Back home
      </Link>
    </div>
  );
}
