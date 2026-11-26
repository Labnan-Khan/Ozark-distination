const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function composedAddress(address = {}) {
  return [
    address.street,
    address.unitNumber,
    address.area,
    address.city,
    address.stateProvince,
    address.country,
    address.postalCode
  ].filter(Boolean).map(normalize).join(' ');
}

function comparePart(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
}

export function exactAddress(property, candidateProperties = []) {
  const source = property?.address || {};
  const sourceFull = normalize(source.fullAddress) || composedAddress(source);
  if (!sourceFull) return { score: 0, signals: [] };

  let best = { score: 0, signals: [] };
  for (const candidate of candidateProperties) {
    const target = candidate?.address || {};
    const targetFull = normalize(target.fullAddress) || composedAddress(target);
    if (sourceFull === targetFull) {
      const score = 1;
      if (score > best.score) {
        best = {
          score,
          signals: [{ field: 'address.fullAddress', value: sourceFull, weight: 1 }]
        };
      }
      continue;
    }

    const parts = ['country', 'stateProvince', 'city', 'area', 'street', 'unitNumber', 'postalCode'];
    const matched = parts.filter((part) => comparePart(source[part], target[part]));
    const hasCoreMatch = matched.includes('city') && matched.includes('street');
    if (!hasCoreMatch || matched.length < 4) continue;

    const score = Math.min(0.9, 0.5 + matched.length * 0.08);
    if (score > best.score) {
      best = {
        score,
        signals: [
          { field: 'address.parts', value: matched, weight: Number(score.toFixed(3)) },
          { field: 'address.city', value: normalize(source.city), weight: 0.2 }
        ]
      };
    }
  }
  return best;
}

export default exactAddress;
