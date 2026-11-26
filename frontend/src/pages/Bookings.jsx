import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, queryString } from '../api/client.js';
import { ErrorBanner, Loading, Pagination, StatusPill, errorText, formatDate, formatDateTime } from '../components/ui.jsx';

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

export function Bookings({ mode = 'customer' }) {
  const isOwner = mode === 'owner';
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const path = isOwner ? '/bookings/owner' : '/bookings/me';
      const { data, meta: responseMeta } = await api.get(`${path}${queryString({ status, page, limit: 20 })}`);
      setBookings(data?.bookings || []);
      setMeta(responseMeta || null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isOwner, status, page]);

  const runAction = async (bookingId, path, body, message, usePrompt = false) => {
    let payload = body;
    if (usePrompt) {
      const text = window.prompt(message);
      if (!text) return;
      payload = { reason: text };
    }
    setBusyId(bookingId);
    setError('');
    try {
      await api.post(`/bookings/${bookingId}/${path}`, payload);
      setNotice(message.startsWith('Enter') ? 'Updated.' : 'Booking updated.');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId('');
    }
  };

  const reviewCancellation = async (booking) => {
    const decision = window.prompt('Enter approve or reject for this cancellation request:', 'approve');
    if (!['approve', 'reject'].includes(decision)) {
      setError('Cancellation decision must be approve or reject.');
      return;
    }
    setBusyId(idOf(booking));
    try {
      const note = window.prompt('Optional note', '') || null;
      await api.post(`/bookings/${idOf(booking)}/review-cancellation`, { decision, note });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>{isOwner ? 'Booking inbox' : 'My bookings'}</h1>
          <p className="muted">{isOwner ? 'Requests for properties you own.' : 'Your booking requests and confirmations.'}</p>
        </div>
      </div>

      <ErrorBanner error={error} onClose={() => setError('')} />
      {notice && <div className="panel small">{notice}</div>}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="booking-status">Status</label>
          <select id="booking-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancellation_requested">Cancellation requested</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <button className="button secondary small" onClick={load}>Refresh</button>
      </div>

      {loading ? <Loading>Loading bookings…</Loading> : bookings.length === 0 ? (
        <div className="empty">No bookings found.</div>
      ) : (
        <div className="stack">
          {bookings.map((booking) => {
            const bookingId = idOf(booking);
            const propertyId = idOf(booking.propertyId);
            const busy = busyId === bookingId;
            return (
              <article className="list-item" key={bookingId}>
                <div>
                  <h3>
                    <Link to={`/properties/${propertyId}`}>{booking.propertySnapshot?.title || 'Property'}</Link>
                    {' '}<StatusPill value={booking.status} />
                  </h3>
                  <div className="meta">
                    <span>Ref: <strong>{booking.reference}</strong></span>
                    <span>{formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}</span>
                    <span>{booking.rentalPeriod}</span>
                    <span>{money(booking.priceSnapshot?.totalMinor, booking.priceSnapshot?.currency)}</span>
                    <span>Created {formatDateTime(booking.createdAt)}</span>
                    {booking.cancellation?.status !== 'none' && <span>Cancellation: {booking.cancellation?.status}</span>}
                  </div>
                  {booking.specialRequests && <p className="small muted" style={{ marginTop: 8 }}>{booking.specialRequests}</p>}
                </div>
                <div className="actions">
                  {isOwner && booking.status === 'pending' && (
                    <>
                      <button className="button small" disabled={busy} onClick={() => runAction(bookingId, 'approve', {}, 'Approve booking')}>Approve</button>
                      <button className="button small danger" disabled={busy} onClick={() => runAction(bookingId, 'reject', null, 'Enter rejection reason', true)}>Reject</button>
                    </>
                  )}
                  {isOwner && booking.status === 'cancellation_requested' && (
                    <button className="button small" disabled={busy} onClick={() => reviewCancellation(booking)}>Review cancellation</button>
                  )}
                  {isOwner && booking.status === 'confirmed' && (
                    <button className="button small secondary" disabled={busy} onClick={() => runAction(bookingId, 'complete', {}, 'Complete booking')}>Complete</button>
                  )}
                  {!isOwner && ['pending', 'confirmed'].includes(booking.status) && (
                    <button className="button small danger" disabled={busy} onClick={() => runAction(bookingId, 'cancellation-request', null, 'Enter cancellation reason', true)}>
                      Request cancellation
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Pagination meta={meta} page={page} onPage={setPage} />
    </section>
  );
}
