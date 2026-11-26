import { useEffect, useState } from 'react';
import { api, queryString } from '../api/client.js';
import { PropertyCard } from '../components/PropertyCard.jsx';

const emptyFilters = {
  q: '', city: '', categoryId: '', minPrice: '', maxPrice: '',
  period: '', checkIn: '', checkOut: '', bedroomsMin: '', sort: 'newest'
};

export function Home() {
  const [filters, setFilters] = useState(emptyFilters);
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState({ properties: [], meta: null });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data?.categories || data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const majorToMinor = (value) => (value ? String(Math.round(Number(value) * 100)) : '');
    const query = queryString({
      ...filters,
      minPrice: majorToMinor(filters.minPrice),
      maxPrice: majorToMinor(filters.maxPrice),
      page,
      limit: 12
    });
    api.get(`/search/properties${query}`)
      .then(({ data }) => { if (active) setResult(data || {}); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page]);

  const update = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
    setPage(1);
  };

  const submit = (event) => {
    event.preventDefault();
    setPage(1);
  };

  return (
    <section className="home">
      <div className="hero">
        <h1>Find your next place to stay</h1>
        <p>Search approved listings, check real availability, and book in minutes.</p>
      </div>

      <form className="search-panel" onSubmit={submit}>
        <input placeholder="Search by title or keyword" value={filters.q} onChange={update('q')} />
        <input placeholder="City" value={filters.city} onChange={update('city')} />
        <select value={filters.categoryId} onChange={update('categoryId')}>
          <option value="">All categories</option>
          {categories.map((category) => {
            const categoryId = category.id || category._id;
            return <option key={categoryId} value={categoryId}>{category.name}</option>;
          })}
        </select>
        <select value={filters.period} onChange={update('period')}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <input type="date" value={filters.checkIn} onChange={update('checkIn')} aria-label="Check in" />
        <input type="date" value={filters.checkOut} onChange={update('checkOut')} aria-label="Check out" />
        <input type="number" min="0" placeholder="Min price" value={filters.minPrice} onChange={update('minPrice')} />
        <input type="number" min="0" placeholder="Max price" value={filters.maxPrice} onChange={update('maxPrice')} />
        <input type="number" min="0" placeholder="Bedrooms" value={filters.bedroomsMin} onChange={update('bedroomsMin')} />
        <select value={filters.sort} onChange={update('sort')}>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        <button className="button" type="submit">Search</button>
      </form>

      {error && <div className="error">Search failed: {error}</div>}

      <div className="section-heading">
        <h2>Available properties</h2>
        {result.meta && <span className="muted">{result.meta.total} results</span>}
      </div>

      {loading ? (
        <div className="center">Loading properties…</div>
      ) : result.properties?.length ? (
        <div className="grid">
          {result.properties.map((property) => <PropertyCard key={property.id || property._id} property={property} />)}
        </div>
      ) : (
        <div className="empty">No properties match these filters yet.</div>
      )}

      {result.meta?.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {result.meta.totalPages}</span>
          <button disabled={!result.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
