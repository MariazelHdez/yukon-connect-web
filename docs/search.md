# Contract search and semantic-search preparation

Yukon Connect currently uses PostgreSQL full-text search for contract discovery and is prepared for pgvector-based semantic search. The semantic path is intentionally wired with local mock embeddings only; tests and local scripts do not call external embedding services.

## Current full-text search flow

1. `infra/sql/contract_search_index.sql` creates `contract_search_index` and the weighted `search_vector` used by the API.
2. `rebuild_contract_search_index()` rebuilds `search_text` and `search_vector` from `vw_contracts_full`.
3. `ContractsRepository` joins `contract_search_index` for full-text matches, synonym expansion, and ranked results.

## pgvector readiness

`infra/sql/contract_search_index.sql` attempts to enable pgvector only when the extension is available in the target PostgreSQL instance:

```sql
create extension if not exists vector;
```

When pgvector is available, the script adds:

```sql
embedding vector(384)
```

on `contract_search_index`. If pgvector is not available or the database role cannot create extensions, the SQL emits a notice and leaves the existing full-text index usable. Install/enable pgvector in the database, rerun the SQL script, and then generate embeddings to activate the semantic-search column.

## Local mock embeddings

The backend defines an `EmbeddingProvider` interface in `apps/api/src/embeddings/provider.ts`. Development uses `MockEmbeddingProvider` from `apps/api/src/embeddings/mock-provider.ts`, which creates deterministic vectors locally from `search_text` and never calls external services.

Generate local mock embeddings with:

```bash
DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api generate-embeddings
```

Optional batching:

```bash
EMBEDDING_BATCH_SIZE=500 DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api generate-embeddings
```

The script scans `contract_search_index` rows where `embedding is null`, calls the mock provider, and updates `embedding` with a pgvector-compatible value. Run `rebuild:contract-search-index` first when source contract data changes; because the rebuild truncates and repopulates the table, embeddings must be regenerated afterward.

## Where to connect a real embedding provider later

To add production embeddings without changing the indexing script shape:

1. Implement the `EmbeddingProvider` interface in a new backend module, for example `apps/api/src/embeddings/openai-provider.ts` or another provider-specific file.
2. Read provider configuration from environment variables or a secrets manager. Do not hardcode API keys.
3. Keep tests on `MockEmbeddingProvider` or dependency-inject a fake provider so tests never call external services.
4. Update `generate-embeddings` to choose the provider from configuration, while keeping `MockEmbeddingProvider` as the default local option.
5. Ensure the provider output dimensions match `contract_search_index.embedding vector(384)` or change the SQL column dimension and mock provider together in one migration.

## Future semantic ranking plan

Once real embeddings are available, search can embed the user query, compare it with `contract_search_index.embedding`, and blend semantic distance with the existing full-text score. A future SQL query could order by pgvector distance, for example:

```sql
order by csi.embedding <=> $query_embedding::vector
```

The initial rollout should keep full-text search as a fallback when a query embedding cannot be generated, when `embedding` is null, or when pgvector is unavailable.
