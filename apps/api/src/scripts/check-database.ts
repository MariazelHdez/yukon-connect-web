import process from 'node:process';

function sslConfig() {
  const sslMode = process.env.PGSSLMODE?.toLowerCase();
  const databaseSsl = process.env.DATABASE_SSL?.toLowerCase();

  if (sslMode === 'require' || databaseSsl === 'true') {
    return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }

  return undefined;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is not configured. Copy .env.example to .env and set DATABASE_URL to check a PostgreSQL connection.');
    process.exitCode = 1;
    return;
  }

  const pg = await import('pg');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: sslConfig(),
    max: 1,
  });

  try {
    const result = await pool.query<{
      version: string;
      current_database: string;
      current_schema: string;
    }>('select version(), current_database(), current_schema()');

    const row = result.rows[0];
    console.log('Database connection OK.');
    console.log(`version: ${row.version}`);
    console.log(`current_database: ${row.current_database}`);
    console.log(`current_schema: ${row.current_schema}`);
  } finally {
    await pool.end();
  }
}

await main();
