function attributeValue(attribute = {}) {
  if (attribute.booleanValue !== undefined && attribute.booleanValue !== null) return attribute.booleanValue;
  if (attribute.numberValue !== undefined && attribute.numberValue !== null) return attribute.numberValue;
  if (attribute.dateValue) return new Date(attribute.dateValue).toISOString().slice(0, 10);
  if (Array.isArray(attribute.arrayValue) && attribute.arrayValue.length) {
    return [...attribute.arrayValue].map(String).sort().join(',');
  }
  if (attribute.stringValue !== undefined && attribute.stringValue !== null) return attribute.stringValue;
  return null;
}

function toMap(attributes = []) {
  const map = new Map();
  for (const attribute of attributes) {
    if (!attribute?.key) continue;
    const value = attributeValue(attribute);
    if (value !== null) map.set(String(attribute.key), value);
  }
  return map;
}

export function attributeSimilarity(property, candidateProperties = []) {
  const source = toMap(property?.attributes);
  if (source.size === 0) return { score: 0, signals: [] };

  let best = { score: 0, signals: [] };
  for (const candidate of candidateProperties) {
    const target = toMap(candidate?.attributes);
    const matches = [];
    for (const [key, value] of source) {
      if (target.has(key) && String(target.get(key)) === String(value)) matches.push(key);
    }
    if (!matches.length) continue;

    const denominator = Math.max(source.size, target.size || 1);
    const score = Math.min(1, matches.length / denominator);
    if (score > best.score) {
      const weight = Number((score / matches.length).toFixed(3));
      best = {
        score,
        signals: matches.map((field) => ({ field: `attributes.${field}`, value: source.get(field), weight }))
      };
    }
  }
  return best;
}

export default attributeSimilarity;
