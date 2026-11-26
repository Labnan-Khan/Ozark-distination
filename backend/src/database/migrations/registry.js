/**
 * Idempotent migrations with forward/rollback/dry-run support.
 * Add new migrations to MIGRATIONS in ascending version order; never edit an
 * applied migration. Each migration must be safe to re-run.
 */
export const MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'baseline-schema-version-markers',
    description: 'Ensure baseline documents carry schemaVersion: 1.',
    async up({ db, dryRun }) {
      const report = {};
      for (const collection of ['users', 'properties', 'bookings']) {
        const filter = { schemaVersion: { $exists: false } };
        report[collection] = dryRun
          ? await db.collection(collection).countDocuments(filter)
          : (await db.collection(collection).updateMany(filter, { $set: { schemaVersion: 1 } })).matchedCount;
      }
      return report;
    },
    async down({ db, dryRun }) {
      const report = {};
      for (const collection of ['users', 'properties', 'bookings']) {
        const filter = { schemaVersion: 1 };
        const update = { $unset: { schemaVersion: '' } };
        report[collection] = dryRun
          ? await db.collection(collection).countDocuments(filter)
          : (await db.collection(collection).updateMany(filter, update)).matchedCount;
      }
      return report;
    }
  }
]);
