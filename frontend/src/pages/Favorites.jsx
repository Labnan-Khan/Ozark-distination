import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PropertyCard } from '../components/PropertyCard.jsx';
import { ErrorBanner, Loading, Pagination, errorText } from '../components/ui.jsx';

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

export function Favorites() {
  const [properties, setProperties] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/favorites?page=${page}&limit=12`)
      .then(({ data, meta: responseMeta }) => {
        if (!active) return;
        setProperties(data?.properties || data?.items || []);
        setMeta(responseMeta || null);
      })
      .catch((err) => { if (active) setError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  const remove = async (propertyId) => {
    setError('');
    try {
      await api.del(`/favorites/${propertyId}`);
      setProperties((current) => current.filter((item) => idOf(item) !== propertyId));
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section>
      <h1>Favorites</h1>
      <p className="muted">Saved properties that are currently published and available.</p>
      <ErrorBanner error={error} onClose={() => setError('')} />
      {loading ? <Loading>Loading favorites…</Loading> : properties.length === 0 ? (
        <div className="empty">You have no favorites yet.</div>
      ) : (
        <div className="stack">
          {properties.map((property) => {
            const propertyId = idOf(property);
            return (
              <div key={propertyId}>
                <PropertyCard property={property} />
                <button className="button small secondary" style={{ marginTop: 8 }} onClick={() => remove(propertyId)}>
                  Remove from favorites
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Pagination meta={meta} page={page} onPage={setPage} />
    </section>
  );
}
