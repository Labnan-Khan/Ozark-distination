import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ErrorBanner, Loading, Pagination, errorText, formatDateTime } from '../components/ui.jsx';

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

export function Notifications() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: '30', unreadOnly: String(unreadOnly) });
      const { data, meta: responseMeta } = await api.get(`/notifications?${query}`);
      setItems(Array.isArray(data) ? data : data?.notifications || []);
      setMeta(responseMeta || null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, unreadOnly]);

  const markRead = async (id) => {
    setError('');
    try {
      await api.patch(`/notifications/${id}/read`, {});
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const markAllRead = async () => {
    setError('');
    try {
      await api.patch('/notifications/read-all', {});
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Booking, property, and account updates.</p>
        </div>
        <div className="actions">
          <label className="checkbox-row">
            <input type="checkbox" checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setPage(1); }} />
            <span>Unread only</span>
          </label>
          <button className="button small secondary" onClick={markAllRead}>Mark all read</button>
          <button className="button small secondary" onClick={load}>Refresh</button>
        </div>
      </div>
      <ErrorBanner error={error} onClose={() => setError('')} />
      {loading ? <Loading>Loading notifications…</Loading> : items.length === 0 ? (
        <div className="empty">No notifications found.</div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <article className="list-item" key={idOf(item)}>
              <div>
                <h3>{item.title}{!item.isRead && <span className="pill pending" style={{ marginLeft: 8 }}>new</span>}</h3>
                <p>{item.body}</p>
                <div className="meta"><span>{formatDateTime(item.createdAt)}</span><span>{item.type}</span></div>
              </div>
              {!item.isRead && (
                <button className="button small secondary" onClick={() => markRead(idOf(item))}>Mark read</button>
              )}
            </article>
          ))}
        </div>
      )}
      <Pagination meta={meta} page={page} onPage={setPage} />
    </section>
  );
}
