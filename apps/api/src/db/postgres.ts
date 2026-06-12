import type { DatabaseClient, DatabaseStatus, QueryResult, QueryValue } from './database.ts';

type PgPool = {
  query<Row>(sql: string, values?: QueryValue[]): Promise<QueryResult<Row>>;
  end(): Promise<void>;
};

let initializationMessage: string | undefined;

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not configured. Set DATABASE_URL to enable contract endpoints.');
    this.name = 'MissingDatabaseUrlError';
  }
}

export class PostgresDatabaseClient implements DatabaseClient {
  private readonly pool: PgPool;

  private constructor(pool: PgPool) {
    this.pool = pool;
  }

  static async fromEnvironment(): Promise<PostgresDatabaseClient | null> {
    if (!process.env.DATABASE_URL) {
      initializationMessage = 'DATABASE_URL is not configured.';
      return null;
    }

    try {
      const pg = await import('pg');
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      initializationMessage = undefined;
      return new PostgresDatabaseClient(pool);
    } catch (error) {
      initializationMessage = error instanceof Error ? error.message : 'Failed to initialize PostgreSQL client.';
      return null;
    }
  }

  async query<Row>(sql: string, values: QueryValue[] = []): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(sql, values);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function getDatabaseStatus(db: DatabaseClient | null): Promise<DatabaseStatus> {
  if (!process.env.DATABASE_URL) {
    return {
      configured: false,
      connected: false,
      message: 'DATABASE_URL is not configured.',
    };
  }

  if (!db) {
    return {
      configured: true,
      connected: false,
      message: initializationMessage ?? 'Database client is not initialized.',
    };
  }

  try {
    await db.query('select 1');
    return { configured: true, connected: true };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : 'Unknown database error.',
    };
  }
}
