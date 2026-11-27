import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, queryString } from '../api/client.js';
import { ErrorBanner, Loading, StatusPill, errorText, formatDateTime } from '../components/ui.jsx';

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

export function AdminProperties() {
  const [properties, setProperties] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [propertiesResponse, requestsResponse] = await Promise.all([
        api.get(`/admin/properties${queryString({ approvalStatus: pendingOnly ? 'pending' : '', limit: 50 })}`),
        api.get('/admin/properties/lifecycle-requests?status=pending&limit=50')
      ]);
      setProperties(propertiesResponse.data?.properties || []);
      setRequests(requestsResponse.data?.requests || requestsResponse.data?.items || []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pendingOnly]);

  const publishProperty = async (property) => {
    setBusyId(idOf(property));
    setError('');
    try {
      await api.post(`/properties/${idOf(property)}/publish`, {});
      setNotice('Property published and visible in public search.');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId('');
    }
  };

  const reviewProperty = async (property, decision) => {
    const body = decision === 'approve'
      ? { note: window.prompt('Optional approval note', '') || null }
      : { reason: window.prompt('Rejection reason') };
    if (decision === 'reject' && !body.reason) return;
    setBusyId(idOf(property));
    setError('');
    try {
      await api.post(`/admin/properties/${idOf(property)}/${decision}`, body);
      setNotice(decision === 'approve'
        ? 'Property approved. Publish it to make it visible in public search.'
        : 'Property rejected.');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId('');
    }
  };

  const reviewRequest = async (request, decision) => {
    const body = decision === 'approve'
      ? { note: window.prompt('Optional note', '') || null }
      : { reason: window.prompt('Rejection reason') };
    if (decision === 'reject' && !body.reason) return;
    setBusyId(idOf(request));
    setError('');
    try {
      await api.post(`/admin/properties/lifecycle-requests/${idOf(request)}/${decision}`, body);
      setNotice('Lifecycle request reviewed.');
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
          <h1>Admin — properties</h1>
          <p className="muted">Approve listings and resolve lifecycle requests.</p>
        </div>
        <div className="actions">
          <label className="checkbox-row">
            <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
            <span>Pending only</span>
          </label>
          <button className="button small secondary" onClick={load}>Refresh</button>
        </div>
      </div>

      <ErrorBanner error={error} onClose={() => setError('')} />
      {notice && <div className="panel small">{notice}</div>}
      {loading ? <Loading>Loading admin queue…</Loading> : (
        <>
          <h2>{pendingOnly ? 'Pending properties' : 'All properties'}</h2>
          {properties.length === 0 ? <div className="empty">No properties in this queue.</div> : (
            <div className="stack">
              {properties.map((property) => {
                const propertyId = idOf(property);
                return (
                  <article className="list-item" key={propertyId}>
                    <div>
                      <h3>
                        <Link to={`/properties/${propertyId}`}>{property.title}</Link>
                        {' '}<StatusPill value={property.approvalStatus} />
                        {' '}<StatusPill value={property.listingStatus} />
                      </h3>
                      <div className="meta">
                        <span>{property.categorySnapshot?.name || 'Property'}</span>
                        <span>{property.address?.city}</span>
                        <span>Submitted {formatDateTime(property.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="actions">
                      {property.approvalStatus === 'approved' && property.listingStatus === 'draft' && (
                        <button className="button small" disabled={busyId === propertyId} onClick={() => publishProperty(property)}>Publish</button>
                      )}
                      <button className="button small" disabled={busyId === propertyId} onClick={() => reviewProperty(property, 'approve')}>Approve</button>
                      <button className="button small danger" disabled={busyId === propertyId} onClick={() => reviewProperty(property, 'reject')}>Reject</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="section-heading" style={{ marginTop: 28 }}>
            <h2>Lifecycle requests</h2>
          </div>
          {requests.length === 0 ? <div className="empty">No pending lifecycle requests.</div> : (
            <div className="stack">
              {requests.map((request) => {
                const requestId = idOf(request);
                return (
                  <article className="list-item" key={requestId}>
                    <div>
                      <h3>{String(request.action || '').toUpperCase()} request <StatusPill value={request.status} /></h3>
                      <p>{request.reason}</p>
                      <div className="meta">
                        <span>Property: {idOf(request.propertyId)}</span>
                        <span>Created {formatDateTime(request.createdAt)}</span>
                      </div>
                    </div>
                    <div className="actions">
                      <button className="button small" disabled={busyId === requestId} onClick={() => reviewRequest(request, 'approve')}>Approve</button>
                      <button className="button small danger" disabled={busyId === requestId} onClick={() => reviewRequest(request, 'reject')}>Reject</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
