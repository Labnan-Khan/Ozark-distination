import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function Footer() {
  const { isAuthenticated, hasRole } = useAuth();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link className="brand" to="/">
            <img className="brand-logo" src="/ozarkIcon.png" alt="" aria-hidden="true" />
            <span className="brand-text">Ozark Destination</span>
          </Link>
          <p className="muted small">
            Approved stays, real availability, and simple booking across Pakistan.
          </p>
        </div>

        <nav className="footer-links" aria-label="Footer navigation">
          <div>
            <h3>Explore</h3>
            <Link to="/">All stays</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
          </div>
          <div>
            <h3>Your account</h3>
            {isAuthenticated ? (
              <>
                <Link to="/profile">Profile</Link>
                <Link to="/notifications">Notifications</Link>
                {hasRole('customer') && <Link to="/bookings">My bookings</Link>}
                {hasRole('customer') && <Link to="/favorites">Favorites</Link>}
                {hasRole('owner') && <Link to="/owner/properties">My properties</Link>}
                {hasRole('owner') && <Link to="/owner/bookings">Booking inbox</Link>}
                {hasRole('admin') && <Link to="/admin/properties">Admin queue</Link>}
              </>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/register">Sign up</Link>
              </>
            )}
          </div>
          <div>
            <h3>Platform</h3>
            <code>/api/v1</code>
            <span className="muted small">V1 property rentals</span>
          </div>
        </nav>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Ozark Destination. All rights reserved.</span>
        <span>Built for approved listings and verified availability.</span>
      </div>
    </footer>
  );
}
