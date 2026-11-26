import { EVENT_TYPES, LISTING_STATUS } from '../../../shared/constants/index.js';
import { eventBus } from '../../../infrastructure/events/index.js';
import { logger } from '../../../infrastructure/logging/index.js';
import { DuplicateFlag } from '../duplicateFlag.model.js';
import { Property } from '../property.model.js';
import { attributeSimilarity } from './strategies/attributeSimilarity.js';
import { exactAddress } from './strategies/exactAddress.js';
import { geoProximity } from './strategies/geoProximity.js';
import { unitNumber } from './strategies/unitNumber.js';

const STRATEGY_VERSION = 1;
const FLAG_THRESHOLD = 0.5;
const CANDIDATE_LIMIT = 50;
const GEO_RADIUS_METERS = 500;

const STRATEGIES = [
  { name: 'exact_address', weight: 0.35, run: exactAddress },
  { name: 'geo_proximity', weight: 0.3, run: geoProximity },
  { name: 'attribute_similarity', weight: 0.2, run: attributeSimilarity },
  { name: 'unit_number', weight: 0.15, run: unitNumber }
];

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function validCoordinates(location) {
  const coordinates = location?.coordinates;
  return Array.isArray(coordinates)
    && coordinates.length === 2
    && coordinates.every(Number.isFinite);
}

async function findCandidates(property, session) {
  if (!property?._id) return [];

  const baseFilter = {
    _id: { $ne: property._id },
    deletedAt: null,
    listingStatus: { $ne: LISTING_STATUS.ARCHIVED }
  };
  const clauses = [];
  if (property.ownerId) clauses.push({ ownerId: property.ownerId });
  if (property.address?.city) clauses.push({ 'address.city': property.address.city });
  if (property.address?.area) clauses.push({ 'address.area': property.address.area });
  if (!clauses.length && !validCoordinates(property.location)) return [];

  const byMetadata = clauses.length
    ? await withSession(
      Property.find({ ...baseFilter, $or: clauses }).limit(CANDIDATE_LIMIT).lean(),
      session
    )
    : [];

  let byGeo = [];
  if (validCoordinates(property.location)) {
    const geometry = {
      type: 'Point',
      coordinates: [...property.location.coordinates]
    };
    byGeo = await withSession(
      Property.find({
        ...baseFilter,
        location: {
          $near: {
            $geometry: geometry,
            $maxDistance: GEO_RADIUS_METERS
          }
        }
      }).limit(CANDIDATE_LIMIT).lean(),
      session
    );
  }

  const merged = new Map();
  for (const candidate of [...byMetadata, ...byGeo]) {
    const key = String(candidate._id);
    if (!merged.has(key)) merged.set(key, candidate);
  }
  return [...merged.values()].slice(0, CANDIDATE_LIMIT);
}

async function persistScore(property, score, session) {
  if (!property?._id) return;
  property.duplicateScore = score;
  if (typeof property.save === 'function') {
    await property.save(session ? { session } : undefined);
    return;
  }
  await Property.updateOne(
    { _id: property._id },
    { $set: { duplicateScore: score } },
    session ? { session } : {}
  );
}

function buildActor(property) {
  return {
    userId: String(property.ownerSnapshot?.id || property.ownerId || null),
    role: 'owner'
  };
}

async function createFlag(result, property, session) {
  const propertyId = property._id;
  const matchedPropertyId = result.matchedPropertyId;
  const existing = await withSession(DuplicateFlag.findOne({
    propertyId,
    matchedPropertyId,
    strategy: result.strategy
  }), session);
  if (existing) return existing;

  const flagData = {
    propertyId,
    matchedPropertyId,
    strategy: result.strategy,
    strategyVersion: STRATEGY_VERSION,
    score: result.score,
    signals: result.signals
  };
  const options = session ? { session } : {};
  const [flag] = await DuplicateFlag.create([flagData], options);

  await eventBus.publish({
    type: EVENT_TYPES.DUPLICATE_FLAGGED,
    actor: buildActor(property),
    payload: {
      propertyId: String(propertyId),
      duplicateFlagId: String(flag._id),
      matchedPropertyId: String(matchedPropertyId),
      strategy: result.strategy,
      score: result.score,
      signals: result.signals
    },
    correlationId: property.correlationId || null
  }, session);

  return flag;
}

export const duplicateDetection = {
  STRATEGY_VERSION,
  FLAG_THRESHOLD,

  async run(property, session = null) {
    try {
      const candidates = await findCandidates(property, session);
      const results = [];

      for (const candidate of candidates) {
        const attributed = STRATEGIES.map(({ name, weight, run }) => {
          const outcome = run(property, [candidate]) || { score: 0, signals: [] };
          return {
            name,
            weight,
            score: Math.max(0, Math.min(1, Number(outcome.score) || 0)),
            signals: outcome.signals || []
          };
        });

        const weighted = attributed.reduce((sum, item) => sum + item.score * item.weight, 0);
        const strongest = attributed.reduce((best, item) => (item.score > best.score ? item : best), attributed[0]);
        const score = Math.min(1, Math.max(weighted, strongest.score * 0.8));
        if (score < FLAG_THRESHOLD) continue;

        const signals = attributed.flatMap((item) => item.signals.map((signal) => ({
          field: signal.field,
          value: signal.value,
          weight: Number((Number(signal.weight || 0) * item.weight).toFixed(4))
        })));
        results.push({
          matchedPropertyId: candidate._id || candidate.id,
          strategy: strongest.name,
          score: Number(score.toFixed(3)),
          signals: signals.slice(0, 20)
        });
      }

      results.sort((a, b) => b.score - a.score);
      const bestScore = results[0]?.score || 0;
      await persistScore(property, bestScore, session);

      const flags = [];
      for (const result of results.slice(0, 10)) {
        flags.push(await createFlag(result, property, session));
      }
      return { score: bestScore, flags, candidates: candidates.length };
    } catch (error) {
      // Duplicate detection is advisory: it must never block listing creation.
      logger.warn({ err: error, propertyId: String(property?._id || '') }, 'duplicate detection skipped');
      return { score: 0, flags: [], candidates: 0 };
    }
  }
};

export default duplicateDetection;
