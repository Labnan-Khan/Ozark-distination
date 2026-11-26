import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export function Layout() {
  const { user, isAuthenticated, hasRole, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0);
      return undefined;
    }
    let active = true;
    const load = () => api.get('/notifications/unread-count')
      .then(({ data }) => { if (active) setUnread(Number(data?.count || 0)); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [isAuthenticated]);

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">Ozark <span>Destination</span></Link>
        <nav className="nav">
          <NavLink to="/">Explore</NavLink>
          {hasRole('customer') && <NavLink to="/bookings">My bookings</NavLink>}
          {hasRole('customer') && <NavLink to="/favorites">Favorites</NavLink>}
          {hasRole('owner') && <NavLink to="/owner/properties">My properties</NavLink>}
          {hasRole('owner') && <NavLink to="/owner/bookings">Booking inbox</NavLink>}
          {hasRole('admin') && <NavLink to="/admin/properties">Admin</NavLink>}
        </nav>
        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <Link className="badge-link" to="/notifications">Notifications{unread ? <span className="badge">{unread}</span> : null}</Link>
              <span className="user-chip">{user?.fullName}</span>
              <button className="link-button" onClick={onLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link className="button small" to="/register">Sign up</Link>
            </>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="footer">V1 API · <code>/api/v1</code></footer>
    </div>
  );
}
