import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { logger } from '../../infrastructure/logging/index.js';
import { MIGRATIONS } from './registry.js';

const MIGRATION_COLLECTION = 'migrations';

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    direction: args.includes('down') ? 'down' : 'up',
    dryRun: args.includes('--dry-run'),
    version: args.includes('--version') ? Number(args[args.indexOf('--version') + 1]) : null
  };
}

function recordFilter(migration) {
  return { version: migration.version, name: migration.name };
}

export async function runMigrations({ direction = 'up', dryRun = false, version = null } = {}) {
  const connection = await connectDatabase();
  const db = connection.db;
  const collection = db.collection(MIGRATION_COLLECTION);
  await collection.createIndex({ version: 1, name: 1 }, { unique: true });

  const selected = version
    ? MIGRATIONS.filter((migration) => migration.version === version)
    : MIGRATIONS;
  if (!selected.length) throw new Error(`No migration found for version ${version}`);

  const results = [];
  for (const migration of selected) {
    const existing = await collection.findOne(recordFilter(migration));
    if (direction === 'up' && existing?.status === 'applied' && !dryRun) {
      results.push({ ...recordFilter(migration), status: 'skipped', reason: 'already applied' });
      continue;
    }
    if (direction === 'down' && (!existing || existing.status !== 'applied') && !dryRun) {
      results.push({ ...recordFilter(migration), status: 'skipped', reason: 'not applied' });
      continue;
    }

    const report = await migration[direction]({ db, dryRun });
    const status = dryRun ? `would_${direction}` : direction === 'up' ? 'applied' : 'rolled_back';
    if (!dryRun) {
      await collection.updateOne(
        recordFilter(migration),
        {
          $set: {
            ...recordFilter(migration),
            status,
            description: migration.description,
            report,
            runAt: new Date()
          }
        },
        { upsert: true }
      );
    }
    results.push({ ...recordFilter(migration), status, report });
  }

  logger.info({ results }, 'migrations finished');
  return results;
}

if (process.argv[1]?.endsWith('migrations/index.js')) {
  runMigrations(parseArgs(process.argv))
    .then(() => disconnectDatabase())
    .catch(async (error) => {
      logger.fatal({ err: error }, 'migration failed');
      await disconnectDatabase();
      process.exit(1);
    });
}
