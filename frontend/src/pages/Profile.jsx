import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBanner, errorText, formatDateTime } from '../components/ui.jsx';

export function Profile() {
  const { user, roles, refreshIdentity, logout } = useAuth();
  const [profile, setProfile] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || ''
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const updateProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.patch('/users/me', profile);
      await refreshIdentity();
      setNotice('Profile updated.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/users/me/change-password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      setNotice('Password changed.');
      await logout();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow auth-card" style={{ maxWidth: 620 }}>
      <h1>Profile</h1>
      <p className="muted">{user?.email}</p>
      <div className="meta" style={{ justifyContent: 'center' }}>
        <span>Roles: {roles.join(', ') || '—'}</span>
        <span>Status: {user?.accountStatus}</span>
        <span>Joined {formatDateTime(user?.createdAt)}</span>
      </div>

      <ErrorBanner error={error} onClose={() => setError('')} />
      {notice && <div className="panel small">{notice}</div>}

      <form className="panel stack" onSubmit={updateProfile}>
        <h2>Account details</h2>
        <div className="field"><label>Full name</label><input required value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></div>
        <div className="field"><label>Phone</label><input required value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></div>
        <button className="button" disabled={busy}>Save details</button>
      </form>

      <form className="panel stack" onSubmit={changePassword}>
        <h2>Change password</h2>
        <div className="field"><label>Current password</label><input type="password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></div>
        <div className="field"><label>New password</label><input type="password" required minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></div>
        <button className="button" disabled={busy}>Change password</button>
      </form>
    </section>
  );
}
