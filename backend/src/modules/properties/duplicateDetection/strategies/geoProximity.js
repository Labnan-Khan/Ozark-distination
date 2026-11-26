const EARTH_RADIUS_METERS = 6371000;
const MAX_DISTANCE_METERS = 500;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return null;
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  if ([lngA, latA, lngB, latB].some((value) => !Number.isFinite(value))) return null;

  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const lat1 = toRadians(latA);
  const lat2 = toRadians(latB);
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function geoProximity(property, candidateProperties = []) {
  const sourceCoordinates = property?.location?.coordinates;
  if (!Array.isArray(sourceCoordinates)) return { score: 0, signals: [] };

  let best = { score: 0, signals: [] };
  for (const candidate of candidateProperties) {
    const distance = haversineMeters(sourceCoordinates, candidate?.location?.coordinates);
    if (distance === null || distance > MAX_DISTANCE_METERS) continue;
    const score = Math.max(0, 1 - distance / MAX_DISTANCE_METERS);
    if (score > best.score) {
      best = {
        score,
        signals: [
          { field: 'location.distanceMeters', value: Math.round(distance), weight: Number(score.toFixed(3)) },
          { field: 'location.coordinates', value: candidate?.location?.coordinates || null, weight: Number(score.toFixed(3)) }
        ]
      };
    }
  }
  return best;
}

export default geoProximity;
