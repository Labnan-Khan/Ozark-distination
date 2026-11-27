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

  const chooseCategory = (categoryId) => {
    setFilters((current) => ({ ...current, categoryId }));
    setPage(1);
  };

  const submit = (event) => {
    event.preventDefault();
    setPage(1);
  };

  return (
    <section className="home">
      <div className="hero">
        <span className="eyebrow">Curated stays across Pakistan</span>
        <h1>Find your next place to stay</h1>
        <p>Discover approved homes, apartments, and workspaces with real availability.</p>
      </div>

      <form className="search-panel" onSubmit={submit}>
        <div className="search-field search-field-wide">
          <label htmlFor="search-q">Where</label>
          <input id="search-q" placeholder="Search by title or keyword" value={filters.q} onChange={update('q')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-city">City</label>
          <input id="search-city" placeholder="Any city" value={filters.city} onChange={update('city')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-category">Type</label>
          <select id="search-category" value={filters.categoryId} onChange={update('categoryId')}>
            <option value="">Any type</option>
            {categories.map((category) => {
              const categoryId = category.id || category._id;
              return <option key={categoryId} value={categoryId}>{category.name}</option>;
            })}
          </select>
        </div>
        <div className="search-field">
          <label htmlFor="search-period">Period</label>
          <select id="search-period" value={filters.period} onChange={update('period')}>
            <option value="">Any period</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="search-field">
          <label htmlFor="search-check-in">Check in</label>
          <input id="search-check-in" type="date" value={filters.checkIn} onChange={update('checkIn')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-check-out">Check out</label>
          <input id="search-check-out" type="date" value={filters.checkOut} onChange={update('checkOut')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-min-price">Min price</label>
          <input id="search-min-price" type="number" min="0" placeholder="Any" value={filters.minPrice} onChange={update('minPrice')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-max-price">Max price</label>
          <input id="search-max-price" type="number" min="0" placeholder="Any" value={filters.maxPrice} onChange={update('maxPrice')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-bedrooms">Bedrooms</label>
          <input id="search-bedrooms" type="number" min="0" placeholder="Any" value={filters.bedroomsMin} onChange={update('bedroomsMin')} />
        </div>
        <div className="search-field">
          <label htmlFor="search-sort">Sort by</label>
          <select id="search-sort" value={filters.sort} onChange={update('sort')}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>
        <button className="search-submit" type="submit">
          <span aria-hidden="true">⌕</span> Search
        </button>
      </form>

      <div className="category-chips" aria-label="Browse by category">
        <button
          type="button"
          className={`chip ${filters.categoryId === '' ? 'active' : ''}`}
          onClick={() => chooseCategory('')}
        >
          All stays
        </button>
        {categories.map((category) => {
          const categoryId = category.id || category._id;
          return (
            <button
              key={categoryId}
              type="button"
              className={`chip ${filters.categoryId === categoryId ? 'active' : ''}`}
              onClick={() => chooseCategory(categoryId)}
            >
              {category.name}
            </button>
          );
        })}
      </div>

      {error && <div className="error">Search failed: {error}</div>}

      <div className="section-heading">
        <div>
          <h2>Available properties</h2>
          <p className="muted small">Places approved by our team and ready to book.</p>
        </div>
        {result.meta && <span className="result-count">{result.meta.total} stays</span>}
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
