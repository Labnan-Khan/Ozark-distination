import { Link } from 'react-router-dom';

export function Forbidden() {
  return (
    <section className="narrow">
      <h1>Access denied</h1>
      <p className="muted">Your account does not have access to this page.</p>
      <Link className="button" to="/">Back to properties</Link>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="narrow">
      <h1>Page not found</h1>
      <p className="muted">This page is not part of the V1 application.</p>
      <Link className="button" to="/">Back to properties</Link>
    </section>
  );
}
