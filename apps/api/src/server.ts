import { createApp } from './app.ts';
import { PostgresDatabaseClient } from './db/postgres.ts';

const port = Number(process.env.API_PORT ?? 3001);
const db = await PostgresDatabaseClient.fromEnvironment();
const app = createApp({ db });

app.server.listen(port, '0.0.0.0', () => {
  console.log(`Yukon Connect API listening on http://0.0.0.0:${port}`);
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not configured; /contracts endpoints will return 503 until it is set.');
  }
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down API.`);
  await app.close();
  await db?.close();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT').then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM').then(() => process.exit(0));
});
