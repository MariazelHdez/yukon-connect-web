import { PostgresDatabaseClient } from '../db/postgres.ts';

async function main(): Promise<void> {
  const db = await PostgresDatabaseClient.fromEnvironment();
  if (!db) {
    console.error('DATABASE_URL is required to rebuild contract_search_index.');
    process.exitCode = 1;
    return;
  }

  try {
    await db.query('select rebuild_contract_search_index()');
    console.log('contract_search_index rebuilt successfully.');
  } finally {
    await db.close();
  }
}

await main();
