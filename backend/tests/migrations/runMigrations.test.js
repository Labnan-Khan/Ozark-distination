import { beforeEach, describe, expect, it, jest } from '@jest/globals';

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return Object.prototype.hasOwnProperty.call(document, key) === value;
        if (operator === '$eq') return document[key] === value;
        if (operator === '$ne') return document[key] !== value;
        throw new Error(`Unsupported filter operator: ${operator}`);
      });
    }
    return document[key] === expected;
  });
}

function applyUpdate(document, update) {
  if (update.$set) Object.assign(document, update.$set);
  if (update.$unset) for (const key of Object.keys(update.$unset)) delete document[key];
}

/** Minimal in-memory stand-in for the Mongo collections used by runMigrations. */
function createFakeDb(initialDocuments = {}) {
  const documents = new Map(
    Object.entries(initialDocuments).map(([name, docs]) => [name, docs.map((doc) => ({ ...doc }))])
  );
  const calls = { createIndex: [], findOne: [], updateOne: [], countDocuments: [], updateMany: [] };
  const collections = new Map();

  const docsFor = (name) => {
    if (!documents.has(name)) documents.set(name, []);
    return documents.get(name);
  };

  function collection(name) {
    if (!collections.has(name)) {
      collections.set(name, {
        async createIndex(...args) {
          calls.createIndex.push({ name, args });
          return `${name}_index`;
        },
        async findOne(filter) {
          calls.findOne.push({ name, filter });
          return docsFor(name).find((doc) => matches(doc, filter)) || null;
        },
        async updateOne(filter, update, options = {}) {
          calls.updateOne.push({ name, filter, update, options });
          const docs = docsFor(name);
          const existing = docs.find((doc) => matches(doc, filter));
          if (existing) {
            applyUpdate(existing, update);
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
          }
          if (options.upsert) {
            const inserted = { ...filter };
            applyUpdate(inserted, update);
            docs.push(inserted);
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
          }
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        },
        async countDocuments(filter) {
          calls.countDocuments.push({ name, filter });
          return docsFor(name).filter((doc) => matches(doc, filter)).length;
        },
        async updateMany(filter, update) {
          calls.updateMany.push({ name, filter, update });
          const affected = docsFor(name).filter((doc) => matches(doc, filter));
          affected.forEach((doc) => applyUpdate(doc, update));
          return { matchedCount: affected.length, modifiedCount: affected.length };
        }
      });
    }
    return collections.get(name);
  }

  return { db: { collection }, calls, docsFor };
}

function baselineDocuments() {
  return {
    users: [{ _id: 'u1' }, { _id: 'u2', schemaVersion: 1 }],
    properties: [{ _id: 'p1' }],
    bookings: [{ _id: 'b1' }]
  };
}

let fake;

jest.unstable_mockModule('../../src/config/database.js', () => ({
  connectDatabase: jest.fn(async () => ({ db: fake.db })),
  disconnectDatabase: jest.fn(async () => {})
}));

const { runMigrations } = await import('../../src/database/migrations/index.js');

describe('runMigrations', () => {
  beforeEach(() => {
    fake = createFakeDb(baselineDocuments());
  });

  it('dry-run reports pending work without writing migration records', async () => {
    const results = await runMigrations({ dryRun: true });

    expect(results).toEqual([
      {
        version: 1,
        name: 'baseline-schema-version-markers',
        status: 'would_up',
        report: { users: 1, properties: 1, bookings: 1 }
      }
    ]);
    expect(fake.calls.createIndex).toHaveLength(1);
    expect(fake.calls.updateOne).toHaveLength(0);
    expect(fake.calls.updateMany).toHaveLength(0);
    expect(fake.docsFor('migrations')).toEqual([]);
    expect(fake.docsFor('users')).toEqual(baselineDocuments().users);
  });

  it('applies migrations and records version 1 as applied', async () => {
    const results = await runMigrations({ direction: 'up' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      version: 1,
      name: 'baseline-schema-version-markers',
      status: 'applied',
      report: { users: 1, properties: 1, bookings: 1 }
    });
    expect(fake.docsFor('migrations')).toHaveLength(1);
    expect(fake.docsFor('migrations')[0]).toMatchObject({
      version: 1,
      name: 'baseline-schema-version-markers',
      status: 'applied'
    });
    expect(fake.docsFor('users')).toEqual([{ _id: 'u1', schemaVersion: 1 }, { _id: 'u2', schemaVersion: 1 }]);
    expect(fake.docsFor('properties')[0].schemaVersion).toBe(1);
    expect(fake.docsFor('bookings')[0].schemaVersion).toBe(1);
  });

  it('skips migrations that are already applied', async () => {
    await runMigrations({ direction: 'up' });
    const writesAfterFirstRun = fake.calls.updateOne.length;

    const results = await runMigrations({ direction: 'up' });

    expect(results[0]).toMatchObject({ version: 1, status: 'skipped', reason: 'already applied' });
    expect(fake.calls.updateOne).toHaveLength(writesAfterFirstRun);
    expect(fake.docsFor('migrations')).toHaveLength(1);
    expect(fake.docsFor('migrations')[0].status).toBe('applied');
  });

  it('rolls back migrations and records the rollback', async () => {
    await runMigrations({ direction: 'up' });

    const results = await runMigrations({ direction: 'down' });

    expect(results[0]).toMatchObject({
      version: 1,
      status: 'rolled_back',
      report: { users: 2, properties: 1, bookings: 1 }
    });
    expect(fake.docsFor('migrations')[0]).toMatchObject({ version: 1, status: 'rolled_back' });
    expect(fake.docsFor('users')).toEqual([{ _id: 'u1' }, { _id: 'u2' }]);
    expect(fake.docsFor('properties')[0].schemaVersion).toBeUndefined();
    expect(fake.docsFor('bookings')[0].schemaVersion).toBeUndefined();
  });
});
