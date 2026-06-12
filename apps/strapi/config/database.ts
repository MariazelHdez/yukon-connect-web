export default ({ env }: { env: any }) => ({
  connection: {
    client: 'postgres',
    connection: {
      connectionString: env(
        'DATABASE_URL',
        env('STRAPI_DATABASE_URL', 'postgresql://yukon:change-me-in-local-env@localhost:5432/yukon_connect'),
      ),
      ssl: env.bool('DATABASE_SSL', false)
        ? {
            rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
          }
        : false,
      schema: env('DATABASE_SCHEMA', 'public'),
    },
    pool: {
      min: env.int('DATABASE_POOL_MIN', 0),
      max: env.int('DATABASE_POOL_MAX', 10),
    },
    acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
  },
});
