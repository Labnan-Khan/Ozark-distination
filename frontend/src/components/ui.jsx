export function ErrorBanner({ error, onClose }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <span>{error}</span>
      {onClose && <button className="link-button" onClick={onClose}>Dismiss</button>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Loading({ children = 'Loading…' }) {
  return <div className="center">{children}</div>;
}

export function Pagination({ meta, page, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button disabled={!meta.hasPrev} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {meta.totalPages}</span>
      <button disabled={!meta.hasNext} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function StatusPill({ value }) {
  return <span className={`pill ${String(value || 'unknown').toLowerCase().replace(/_/g, '-')}`}>{value || 'unknown'}</span>;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function errorText(error) {
  if (!error) return '';
  if (error.details?.length) {
    return error.details.map((detail) => detail.message || detail.field).filter(Boolean).join('; ');
  }
  return error.message || String(error);
}
