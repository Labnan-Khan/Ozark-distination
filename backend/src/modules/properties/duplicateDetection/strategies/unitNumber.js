const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

export function unitNumber(property, candidateProperties = []) {
  const sourceUnit = normalize(property?.address?.unitNumber);
  if (!sourceUnit) return { score: 0, signals: [] };

  let best = { score: 0, signals: [] };
  for (const candidate of candidateProperties) {
    const targetUnit = normalize(candidate?.address?.unitNumber);
    if (!targetUnit || targetUnit !== sourceUnit) continue;

    const sameCity = normalize(property?.address?.city) === normalize(candidate?.address?.city);
    const sameStreet = normalize(property?.address?.street) === normalize(candidate?.address?.street);
    if (!sameCity) continue;

    const score = sameStreet ? 0.9 : 0.75;
    if (score > best.score) {
      best = {
        score,
        signals: [
          { field: 'address.unitNumber', value: sourceUnit, weight: score },
          { field: 'address.street', value: sameStreet ? 'match' : 'different', weight: sameStreet ? 0.15 : 0 }
        ]
      };
    }
  }
  return best;
}

export default unitNumber;
