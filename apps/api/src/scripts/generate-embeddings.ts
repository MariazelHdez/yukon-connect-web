import { PostgresDatabaseClient } from '../db/postgres.ts';
import { MockEmbeddingProvider } from '../embeddings/mock-provider.ts';
import { formatEmbeddingForPgVector } from '../embeddings/provider.ts';

const DEFAULT_BATCH_SIZE = 100;

type SearchIndexRow = {
  id: number;
  search_text: string;
};

type EmbeddingColumnRow = {
  exists: boolean;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const db = await PostgresDatabaseClient.fromEnvironment();
  if (!db) {
    console.error('DATABASE_URL is required to generate mock embeddings.');
    process.exitCode = 1;
    return;
  }

  const provider = new MockEmbeddingProvider();
  const batchSize = parsePositiveInteger(process.env.EMBEDDING_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  let processedCount = 0;

  try {
    const embeddingColumn = await db.query<EmbeddingColumnRow>(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'contract_search_index'
            and column_name = 'embedding'
        ) as exists
      `,
    );

    if (!embeddingColumn.rows[0]?.exists) {
      console.error(
        'contract_search_index.embedding does not exist. Enable pgvector and rerun infra/sql/contract_search_index.sql first.',
      );
      process.exitCode = 1;
      return;
    }

    for (;;) {
      const rows = await db.query<SearchIndexRow>(
        `
          select id, search_text
          from contract_search_index
          where embedding is null
          order by id
          limit $1
        `,
        [batchSize],
      );

      if (rows.rows.length === 0) {
        break;
      }

      for (const row of rows.rows) {
        const embedding = await provider.embed(row.search_text);
        await db.query(
          `
            update contract_search_index
            set embedding = $2::vector,
                last_indexed_at = now()
            where id = $1
          `,
          [row.id, formatEmbeddingForPgVector(embedding)],
        );
        processedCount += 1;
      }

      console.log(`Generated ${processedCount} ${provider.name} embeddings...`);
    }

    console.log(`Generated ${processedCount} ${provider.name} embeddings for contract_search_index.`);
  } finally {
    await db.close();
  }
}

await main();
