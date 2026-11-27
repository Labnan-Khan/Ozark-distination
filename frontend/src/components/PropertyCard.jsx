import { Link } from 'react-router-dom';
import { money } from '../api/client.js';

export function attributeValue(property, key) {
  const attribute = property?.attributes?.find((item) => item.key === key);
  if (!attribute) return null;
  if (attribute.value !== undefined) return attribute.value;
  return attribute.numberValue ?? attribute.stringValue ?? attribute.booleanValue ?? attribute.arrayValue?.[0] ?? null;
}

export function PropertyCard({ property }) {
  const mediaList = Array.isArray(property.media)
    ? property.media
    : Array.isArray(property.media?.items)
      ? property.media.items
      : [];
  const cover = property.coverImage
    || mediaList.find((item) => item.isCover)
    || mediaList[0];
  const propertyId = property.id || property._id;
  const rates = property.pricing?.rates || [];
  const currency = property.pricing?.currency || 'PKR';
  const bedrooms = attributeValue(property, 'bedrooms');

  return (
    <Link className="property-card" to={`/properties/${propertyId}`}>
      <div className="property-image">
        {cover?.secureUrl
          ? <img src={cover.secureUrl} alt={property.title} loading="lazy" />
          : <span className="image-placeholder">No image yet</span>}
        {property.availability?.status && (
          <span className={`pill ${property.availability.status}`}>{property.availability.status}</span>
        )}
      </div>
      <div className="property-body">
        <h3>{property.title}</h3>
        <p className="muted">
          {[property.address?.area, property.address?.city, property.address?.country].filter(Boolean).join(', ')}
        </p>
        <p className="muted small">
          {property.categorySnapshot?.name || property.category?.name || 'Property'}
          {bedrooms ? ` · ${bedrooms} bedrooms` : ''}
        </p>
        <div className="price-row">
          {rates.slice(0, 2).map((rate) => (
            <span key={rate.period}>{money(rate.amountMinor, currency)}/{rate.period}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
