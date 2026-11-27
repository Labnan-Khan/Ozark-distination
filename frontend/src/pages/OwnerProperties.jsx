import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { ErrorBanner, Loading, Pagination, StatusPill, errorText, formatDateTime } from '../components/ui.jsx';

function idOf(value) {
  return typeof value === 'string' ? value : value?._id || value?.id || '';
}

const emptyForm = {
  title: '',
  description: '',
  categoryId: '',
  country: '',
  stateProvince: '',
  city: '',
  area: '',
  street: '',
  postalCode: '',
  latitude: '',
  longitude: '',
  period: '',
  rates: {},
  mode: 'request',
  attributes: {},
  amenities: []
};

function attributeInput(definition, value, onChange) {
  const key = definition.key;
  const label = definition.label || key;
  const common = { id: `attr-${key}`, value: value ?? '' };

  if (definition.dataType === 'boolean') {
    return (
      <div className="field" key={key}>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(key, event.target.checked)} />
          <span>{label}</span>
        </label>
      </div>
    );
  }

  if (definition.dataType === 'enum') {
    return (
      <div className="field" key={key}>
        <label htmlFor={common.id}>{label}{definition.required ? ' *' : ''}</label>
        <select id={common.id} value={common.value} onChange={(event) => onChange(key, event.target.value)}>
          <option value="">Select…</option>
          {(definition.options || []).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}
        </select>
      </div>
    );
  }

  if (definition.dataType === 'multiEnum') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="field" key={key}>
        <label>{label}{definition.required ? ' *' : ''}</label>
        <div className="checkbox-row" style={{ flexWrap: 'wrap' }}>
          {(definition.options || []).map((option) => (
            <label className="checkbox-row" key={option.value} style={{ marginRight: 14 }}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) => onChange(
                  key,
                  event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value)
                )}
              />
              <span>{option.label || option.value}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="field" key={key}>
      <label htmlFor={common.id}>{label}{definition.required ? ' *' : ''}{definition.unit ? ` (${definition.unit})` : ''}</label>
      <input
        id={common.id}
        type={['integer', 'number'].includes(definition.dataType) ? 'number' : definition.dataType === 'date' ? 'date' : 'text'}
        value={common.value}
        onChange={(event) => onChange(key, ['integer', 'number'].includes(definition.dataType)
          ? (event.target.value === '' ? '' : Number(event.target.value))
          : event.target.value)}
      />
    </div>
  );
}

function buildAttributes(category, values) {
  const definitions = category?.attributeSchema || [];
  return definitions
    .filter((definition) => !definition.deprecated)
    .map((definition) => ({ key: definition.key, value: values[definition.key] }))
    .filter((attribute) => attribute.value !== '' && attribute.value !== null && attribute.value !== undefined);
}

export function OwnerProperties() {
  const [properties, setProperties] = useState([]);
  const [meta, setMeta] = useState(null);
  const [categories, setCategories] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedCategory = useMemo(
    () => categories.find((category) => idOf(category) === form.categoryId),
    [categories, form.categoryId]
  );
  const periods = selectedCategory?.allowedRentalPeriods?.length
    ? selectedCategory.allowedRentalPeriods
    : ['daily', 'weekly', 'monthly', 'yearly'];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta: responseMeta } = await api.get(`/properties/me?page=${page}&limit=20`);
      setProperties(data?.properties || []);
      setMeta(responseMeta || null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  useEffect(() => {
    api.get('/categories')
      .then(({ data }) => setCategories(data?.categories || []))
      .catch(() => {});
    api.get('/amenities')
      .then(({ data }) => setAmenities(data?.amenities || []))
      .catch(() => {});
  }, []);

  const selectCategory = (categoryId) => {
    const category = categories.find((item) => idOf(item) === categoryId);
    const allowed = category?.allowedRentalPeriods?.length ? category.allowedRentalPeriods : ['monthly'];
    const defaults = {};
    (category?.attributeSchema || []).forEach((definition) => {
      if (definition.defaultValue !== null && definition.defaultValue !== undefined) defaults[definition.key] = definition.defaultValue;
    });
    setForm((current) => ({
      ...current,
      categoryId,
      period: allowed[0],
      rates: Object.fromEntries(allowed.map((period) => [period, current.rates[period] || ''])),
      attributes: defaults
    }));
  };

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setAttribute = (key, value) => setForm((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
  const setRate = (period) => (event) => setForm((current) => ({ ...current, rates: { ...current.rates, [period]: event.target.value } }));
  const toggleAmenity = (amenityId) => setForm((current) => ({
    ...current,
    amenities: current.amenities.includes(amenityId)
      ? current.amenities.filter((item) => item !== amenityId)
      : [...current.amenities, amenityId]
  }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const rates = periods
      .map((period) => ({ period, amountMinor: Math.round(Number(form.rates[period] || 0) * 100) }))
      .filter((rate) => rate.amountMinor > 0);
    if (!form.categoryId || !form.title.trim() || !form.description.trim() || !form.country.trim()
      || !form.city.trim() || !form.street.trim() || !form.period || rates.length === 0) {
      setError('Complete the required fields and at least one nightly/monthly rate.');
      return;
    }

    const latitude = form.latitude === '' ? null : Number(form.latitude);
    const longitude = form.longitude === '' ? null : Number(form.longitude);
    const location = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { type: 'Point', coordinates: [longitude, latitude] }
      : null;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId,
      address: {
        country: form.country.trim(),
        stateProvince: form.stateProvince.trim() || null,
        city: form.city.trim(),
        area: form.area.trim() || null,
        street: form.street.trim(),
        postalCode: form.postalCode.trim() || null
      },
      location,
      attributes: buildAttributes(selectedCategory, form.attributes),
      amenities: form.amenities,
      pricing: {
        currency: 'PKR',
        defaultPeriod: form.period,
        rates,
        requiresDeposit: false,
        depositMinor: null,
        additionalCharges: [],
        taxConfig: null
      },
      rentalPeriods: periods,
      bookingConfig: {
        mode: form.mode,
        minUnits: 1,
        maxUnits: 365,
        requireGuestCount: false,
        maxGuests: null,
        sameDayCheckInAllowed: false,
        cancellationPolicyId: null,
        autoExpireMinutes: null,
        bookingWindowDays: 365
      },
      availability: { isOpenForBooking: true, leadTimeDays: 0, maxAdvanceDays: 365, note: null }
    };

    setSaving(true);
    try {
      await api.post('/properties', payload);
      setForm(emptyForm);
      setShowCreate(false);
      setPage(1);
      setNotice('Property created. Add photos and submit it for approval.');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (property, path, body, promptMessage) => {
    let payload = body;
    if (promptMessage !== undefined) {
      const text = window.prompt(promptMessage);
      if (!text) return;
      payload = { reason: text };
    }
    setError('');
    try {
      await api.post(`/properties/${idOf(property)}/${path}`, payload);
      setNotice('Property updated.');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const uploadMedia = async (property) => {
    const propertyId = idOf(property);
    const selected = files[propertyId];
    if (!selected?.length) return;
    setError('');
    const body = new FormData();
    Array.from(selected).forEach((file) => body.append('images', file));
    try {
      await api.post(`/properties/${propertyId}/media`, body);
      setFiles((current) => ({ ...current, [propertyId]: null }));
      setNotice('Images uploaded.');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>My properties</h1>
          <p className="muted">Create listings, upload photos, and submit them for approval.</p>
        </div>
        <button className="button" onClick={() => setShowCreate((current) => !current)}>
          {showCreate ? 'Close form' : 'Add property'}
        </button>
      </div>

      <ErrorBanner error={error} onClose={() => setError('')} />
      {notice && <div className="panel small">{notice}</div>}

      {showCreate && (
        <form className="panel stack" onSubmit={submit}>
          <h2>New property</h2>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="property-title">Title *</label>
              <input id="property-title" required minLength={5} maxLength={150} value={form.title} onChange={setField('title')} />
            </div>
            <div className="field">
              <label htmlFor="property-category">Category *</label>
              <select id="property-category" required value={form.categoryId} onChange={(event) => selectCategory(event.target.value)}>
                <option value="">Select category…</option>
                {categories.map((category) => <option key={idOf(category)} value={idOf(category)}>{category.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="property-description">Description *</label>
            <textarea id="property-description" required value={form.description} onChange={setField('description')} />
          </div>

          <h3>Address</h3>
          <div className="form-grid three">
            <div className="field"><label>Country *</label><input required value={form.country} onChange={setField('country')} /></div>
            <div className="field"><label>State / province</label><input value={form.stateProvince} onChange={setField('stateProvince')} /></div>
            <div className="field"><label>City *</label><input required value={form.city} onChange={setField('city')} /></div>
            <div className="field"><label>Area</label><input value={form.area} onChange={setField('area')} /></div>
            <div className="field"><label>Street *</label><input required value={form.street} onChange={setField('street')} /></div>
            <div className="field"><label>Postal code</label><input value={form.postalCode} onChange={setField('postalCode')} /></div>
          </div>

          <h3>Location (optional)</h3>
          <div className="form-grid two">
            <div className="field"><label>Latitude</label><input type="number" step="any" value={form.latitude} onChange={setField('latitude')} /></div>
            <div className="field"><label>Longitude</label><input type="number" step="any" value={form.longitude} onChange={setField('longitude')} /></div>
          </div>

          <h3>Attributes</h3>
          <div className="form-grid three">
            {(selectedCategory?.attributeSchema || [])
              .filter((definition) => !definition.deprecated)
              .map((definition) => attributeInput(definition, form.attributes[definition.key], setAttribute))}
            {!selectedCategory && <p className="muted">Choose a category to see its required attributes.</p>}
          </div>

          <h3>Pricing</h3>
          <div className="form-grid three">
            <div className="field">
              <label>Default period</label>
              <select value={form.period} onChange={setField('period')}>
                {periods.map((period) => <option key={period} value={period}>{period}</option>)}
              </select>
            </div>
            {periods.map((period) => (
              <div className="field" key={period}>
                <label>{period} rate (PKR) *</label>
                <input type="number" min="0" step="0.01" value={form.rates[period] || ''} onChange={setRate(period)} />
              </div>
            ))}
          </div>

          <div className="field" style={{ maxWidth: 280 }}>
            <label>Booking mode</label>
            <select value={form.mode} onChange={setField('mode')}>
              <option value="request">Owner approval</option>
              <option value="instant">Instant confirmation</option>
            </select>
          </div>

          <h3>Amenities</h3>
          <div className="checkbox-row" style={{ flexWrap: 'wrap' }}>
            {amenities.map((amenity) => (
              <label className="checkbox-row" key={idOf(amenity)} style={{ marginRight: 18 }}>
                <input
                  type="checkbox"
                  checked={form.amenities.includes(idOf(amenity))}
                  onChange={() => toggleAmenity(idOf(amenity))}
                />
                <span>{amenity.name}</span>
              </label>
            ))}
          </div>

          <div><button className="button" disabled={saving}>{saving ? 'Creating…' : 'Create property'}</button></div>
        </form>
      )}

      {loading ? <Loading>Loading properties…</Loading> : properties.length === 0 ? (
        <div className="empty">You have not created any properties yet.</div>
      ) : (
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
                    <span>Created {formatDateTime(property.createdAt)}</span>
                  </div>
                  <div className="inline-form" style={{ marginTop: 12 }}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => setFiles((current) => ({ ...current, [propertyId]: event.target.files }))}
                      style={{ maxWidth: 280 }}
                    />
                    <button className="button small secondary" onClick={() => uploadMedia(property)}>Upload images</button>
                  </div>
                </div>
                <div className="actions">
                  {['draft', 'rejected'].includes(property.approvalStatus) && (
                    <button className="button small" onClick={() => runAction(property, 'submit', {}, undefined)}>Submit for approval</button>
                  )}
                  {property.approvalStatus === 'approved' && property.listingStatus === 'draft' && (
                    <button className="button small" onClick={() => runAction(property, 'publish', {}, undefined)}>Publish</button>
                  )}
                  {property.listingStatus === 'published' && (
                    <button className="button small secondary" onClick={() => runAction(property, 'archive', { reason: 'Owner requested archive' }, undefined)}>Archive</button>
                  )}
                  <button
                    className="button small danger"
                    onClick={() => runAction(property, 'delete-request', null, 'Reason for delete request')}
                  >
                    Request delete
                  </button>
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
