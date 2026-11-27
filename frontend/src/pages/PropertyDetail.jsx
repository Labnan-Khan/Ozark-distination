import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, queryString } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBanner, Loading, StatusPill, errorText, formatDate } from '../components/ui.jsx';

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30, yearly: 365, custom: 1 };

function addDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

function addressLine(address) {
  if (!address) return '';
  return [address.area, address.city, address.stateProvince, address.country].filter(Boolean).join(', ');
}

export function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, hasRole } = useAuth();
  const [property, setProperty] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({
    checkIn: addDaysISO(1),
    checkOut: addDaysISO(8),
    rentalPeriod: 'monthly',
    guests: '',
    specialRequests: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/properties/${id}`)
      .then(({ data }) => {
        if (!active) return;
        const next = data?.property || null;
        setProperty(next);
        setMedia(Array.isArray(data?.media) ? data.media : data?.media?.items || next?.media || []);
        setForm((current) => ({
          ...current,
          rentalPeriod: next?.pricing?.defaultPeriod || next?.rentalPeriods?.[0] || 'monthly'
        }));
      })
      .catch((err) => { if (active) setError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated || !hasRole('customer')) return;
    api.get(`/favorites/${id}/status`)
      .then(({ data }) => setIsFavorite(Boolean(data?.isFavorite)))
      .catch(() => {});
  }, [id, isAuthenticated, hasRole]);

  const rates = property?.pricing?.rates || [];
  const currency = property?.pricing?.currency || 'PKR';
  const periods = property?.rentalPeriods || rates.map((rate) => rate.period) || [];

  const estimate = useMemo(() => {
    const rate = rates.find((item) => item.period === form.rentalPeriod);
    if (!rate) return null;
    const days = Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000);
    const divisor = PERIOD_DAYS[form.rentalPeriod] || 1;
    if (!Number.isFinite(days) || days <= 0) return null;
    const units = form.rentalPeriod === 'custom' ? days : days / divisor;
    if (!Number.isInteger(units) || units < 1) return null;
    return { units, totalMinor: Number(rate.amountMinor) * units, unitAmountMinor: Number(rate.amountMinor) };
  }, [rates, form.rentalPeriod, form.checkIn, form.checkOut]);

  const images = useMemo(() => {
    const candidate = media.length ? media : property?.media;
    const list = Array.isArray(candidate)
      ? candidate
      : Array.isArray(candidate?.items)
        ? candidate.items
        : [];
    return [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [media, property]);

  const toggleFavorite = async () => {
    setActionError('');
    if (!isAuthenticated || !hasRole('customer')) {
      navigate('/login', { state: { from: { pathname: `/properties/${id}` } } });
      return;
    }
    try {
      if (isFavorite) {
        await api.del(`/favorites/${id}`);
        setIsFavorite(false);
        setNotice('Removed from favorites.');
      } else {
        await api.post('/favorites', { propertyId: id });
        setIsFavorite(true);
        setNotice('Saved to favorites.');
      }
    } catch (err) {
      setActionError(errorText(err));
    }
  };

  const checkAvailability = async () => {
    setChecking(true);
    setActionError('');
    setNotice('');
    try {
      const query = queryString({ checkIn: form.checkIn, checkOut: form.checkOut });
      const { data } = await api.get(`/properties/${id}/availability${query}`);
      setAvailability(data);
      if (!data?.available) setNotice(`Unavailable: ${data?.reason || 'selected dates'}`);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setChecking(false);
    }
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    setActionError('');
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/properties/${id}` } } });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        propertyId: id,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        rentalPeriod: form.rentalPeriod,
        guests: form.guests ? Number(form.guests) : null,
        specialRequests: form.specialRequests || null
      };
      await api.post('/bookings', payload);
      navigate('/bookings');
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading>Loading property…</Loading>;
  if (error || !property) return <><ErrorBanner error={error || 'Property not found.'} /><Link to="/">Browse properties</Link></>;

  const attributes = property.attributes || [];
  const location = property.location?.coordinates;
  const mapSrc = location?.length === 2 ? (() => {
    const [lng, lat] = location;
    const spread = 0.02;
    const bbox = [lng - spread, lat - spread, lng + spread, lat + spread].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
  })() : null;
  const bookable = property.approvalStatus === 'approved'
    && property.listingStatus === 'published'
    && property.availability?.isOpenForBooking !== false;

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="muted small">
            <Link to="/">Explore</Link> / {property.categorySnapshot?.name || 'Property'}
          </p>
          <h1>{property.title}</h1>
          <p className="muted">{addressLine(property.address)}</p>
        </div>
        <div className="actions">
          <StatusPill value={property.availability?.status || property.listingStatus} />
          {hasRole('customer') && (
            <button className={`button small ${isFavorite ? 'secondary' : ''}`} onClick={toggleFavorite}>
              {isFavorite ? '♥ Saved' : '♡ Save'}
            </button>
          )}
        </div>
      </div>

      <ErrorBanner error={actionError} onClose={() => setActionError('')} />
      {notice && <div className="panel small">{notice}</div>}

      <div className="detail-grid">
        <div>
          <div className="gallery">
            {images.length ? images.map((item, index) => (
              <img
                key={idOf(item) || index}
                className={index === 0 ? 'large' : ''}
                src={item.secureUrl || item.url}
                alt={property.title}
              />
            )) : <div className="placeholder">No images uploaded yet</div>}
          </div>

          <div className="panel">
            <h2>About this property</h2>
            <p>{property.description}</p>
            <div className="facts">
              <div className="fact"><strong>Category</strong>{property.categorySnapshot?.name || '—'}</div>
              <div className="fact"><strong>Booking mode</strong>{property.bookingConfig?.mode === 'instant' ? 'Instant confirmation' : 'Owner approval'}</div>
              <div className="fact"><strong>Status</strong>{bookable ? 'Available to book' : 'Not currently bookable'}</div>
              <div className="fact"><strong>Rental periods</strong>{periods.join(', ') || '—'}</div>
            </div>
            {attributes.length > 0 && (
              <ul className="attribute-list">
                {attributes.map((attribute) => (
                  <li key={attribute.key}>
                    <strong>{attribute.key.replace(/_/g, ' ')}:</strong> {String(
                      attribute.value ?? attribute.numberValue ?? attribute.stringValue
                      ?? attribute.booleanValue ?? attribute.dateValue ?? attribute.arrayValue?.[0] ?? '—'
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mapSrc && (
              <div className="location-block">
                <h3>Where you’ll be</h3>
                <p className="muted small">Approximate location · {location[1]}, {location[0]}</p>
                <iframe
                  className="map-frame"
                  title={`Map of ${property.title}`}
                  src={mapSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
        </div>

        <aside className="panel booking-card">
          <h2>Book this place</h2>
          {rates.slice(0, 4).map((rate) => (
            <div className="price-line" key={rate.period}>
              <span className="muted">{rate.period}</span>
              <strong>{money(rate.amountMinor, currency)}</strong>
            </div>
          ))}
          <form className="stack" onSubmit={submitBooking} style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="check-in">Check in</label>
              <input id="check-in" type="date" required value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="check-out">Check out</label>
              <input id="check-out" type="date" required value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="rental-period">Rental period</label>
              <select id="rental-period" value={form.rentalPeriod} onChange={(event) => setForm({ ...form, rentalPeriod: event.target.value })}>
                {periods.map((period) => <option key={period} value={period}>{period}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="guests">Guests (optional)</label>
              <input id="guests" type="number" min="1" value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="requests">Special requests</label>
              <textarea id="requests" maxLength={1000} value={form.specialRequests} onChange={(event) => setForm({ ...form, specialRequests: event.target.value })} />
            </div>
            {estimate && (
              <div className="price-line total">
                <span>Estimate ({estimate.units} {form.rentalPeriod})</span>
                <span>{money(estimate.totalMinor, currency)}</span>
              </div>
            )}
            <button type="button" className="button secondary" onClick={checkAvailability} disabled={checking}>
              {checking ? 'Checking…' : 'Check availability'}
            </button>
            <button className="button" disabled={submitting || !bookable}>
              {submitting ? 'Requesting…' : property.bookingConfig?.mode === 'instant' ? 'Book now' : 'Request booking'}
            </button>
            <p className="small muted">Dates must be an exact multiple of the selected rental period.</p>
          </form>
        </aside>
      </div>
    </section>
  );
}
