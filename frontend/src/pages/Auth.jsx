import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBanner, errorText } from '../components/ui.jsx';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow auth-card">
      <h1>Welcome back</h1>
      <p className="muted">Log in to manage bookings, properties, and notifications.</p>
      <div className="auth-tabs">
        <Link className="active" to="/login">Log in</Link>
        <Link to="/register">Create account</Link>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <ErrorBanner error={error} onClose={() => setError('')} />
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={form.password} onChange={update('password')} />
        </div>
        <button className="button" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </section>
  );
}

const emptyRegistration = { fullName: '', email: '', phone: '', password: '' };

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState(emptyRegistration);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(role, form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow auth-card">
      <h1>Create your account</h1>
      <p className="muted">V1 supports customer and owner accounts.</p>
      <div className="auth-tabs">
        <Link to="/login">Log in</Link>
        <Link className="active" to="/register">Create account</Link>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <ErrorBanner error={error} onClose={() => setError('')} />
        <div className="field">
          <label>Account type</label>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="customer">Customer — book properties</option>
            <option value="owner">Owner — list properties</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="register-name">Full name</label>
          <input id="register-name" required minLength={2} maxLength={100} value={form.fullName} onChange={update('fullName')} />
        </div>
        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input id="register-email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        </div>
        <div className="field">
          <label htmlFor="register-phone">Phone</label>
          <input id="register-phone" required value={form.phone} onChange={update('phone')} placeholder="Phone number" />
        </div>
        <div className="field">
          <label htmlFor="register-password">Password</label>
          <input id="register-password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={update('password')} />
        </div>
        <button className="button" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </section>
  );
}
