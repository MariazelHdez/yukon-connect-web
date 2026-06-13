# Yukon Connect API

The API is a small TypeScript Node.js service under `apps/api`. It only reads from the existing PostgreSQL schema and does not run migrations or destructive SQL.

## Configuration

- `API_PORT`: HTTP port. Defaults to `3001`.
- `DATABASE_URL`: PostgreSQL connection string. If unset, `/health` still works and reports that the database is not configured; contract endpoints return `503`.
- `API_CORS_ORIGINS` / `API_CORS_ORIGIN`: allowed browser origins. `API_CORS_ORIGINS` accepts a comma-separated list and defaults locally to `http://localhost:3000`.
- `API_RATE_LIMIT_MAX`: maximum requests per rate-limit window. Defaults to `120`.
- `API_RATE_LIMIT_WINDOW_MS`: rate-limit window in milliseconds. Defaults to `60000`.
- `API_ENABLE_HSTS`: set to `true` only when the API is served over HTTPS.

This repo intentionally avoids failing when `DATABASE_URL` is absent. To use PostgreSQL-backed endpoints in an environment where the `pg` package is not already installed, add/install `pg` with your package manager before starting the API.

Example local startup:

```bash
DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api start
```

## Endpoints

### `GET /health`

Returns API status and database connectivity state.

```json
{
  "status": "ok",
  "database": {
    "configured": true,
    "connected": true
  }
}
```

When `DATABASE_URL` is not set, `configured` and `connected` are `false`; this is not treated as a service startup failure.

### `GET /contracts`

Returns paginated contracts from `vw_contracts_full`. The implementation uses parameterized SQL values for all user-provided filters.

Supported query parameters:

| Parameter | Type | Notes |
| --- | --- | --- |
| `page` | positive integer | Defaults to `1`. |
| `pageSize` | positive integer | Defaults to `25`; maximum `100`. |
| `q` | string | Uses PostgreSQL full-text search through `contract_search_index`, expands matching `search_synonyms.term` values with their synonyms, and includes contracts linked through matching `tags`/`contract_tags`. Exact `contract_no` matches rank first, followed by vendor/project manager matches, tag/synonym matches, then description and metadata full-text matches. Results include numeric `score` and `match_reason`. |
| `vendor` | string | Exact match against `vendor`. |
| `department` | string | Exact match against `department`. |
| `community` | string | Exact match against `community`. |
| `fiscalYear` | string | Exact match against `fiscal_year`. |
| `projectManager` | string | Exact match against `project_manager`. |
| `contractType` | string | Exact match against `contract_type`. |
| `tenderClass` | string | Exact match against `tender_class`. |
| `minAmount` | number | Minimum `amount`. |
| `maxAmount` | number | Maximum `amount`. |
| `startDateFrom` | ISO date | Inclusive lower bound against `contract_records.start_date`. |
| `startDateTo` | ISO date | Inclusive upper bound against `contract_records.start_date`. |

Response shape:

```json
{
  "data": [
    {
      "id": 123,
      "contract_no": "C-123",
      "score": 0.42,
      "match_reason": ["full_text", "tag_match"]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 100
  }
}
```

Invalid query parameters return `400` with a `details` array. `pageSize` is capped at `100`, so `GET /contracts` cannot request unlimited rows in a single response.


`match_reason` explains why each search result matched the submitted `q` value. It can include:

- `exact_contract_no`: `q` exactly matches the contract number.
- `vendor_match`: `q` matches the vendor name.
- `project_manager_match`: `q` matches the project manager.
- `full_text`: `q` or an expanded synonym matches the full-text index or searchable contract metadata.
- `tag_match`: `q` matches a tag assigned to the contract.
- `synonym_match`: `q` matched a synonym term and one of the expanded synonyms matched searchable fields or assigned tags.

For example, `q=construction` expands through seeded synonyms to include `infrastructure`, `bridge`, `road`, and `materials`, so contracts tagged with `bridge`, `materials`, or `infrastructure` are eligible results. `q=apples` expands to `food` and `produce`, so food/produce-related contracts can match through synonyms or tags.

### `GET /contracts/:id`

Returns one complete contract row from `vw_contracts_full` by numeric `id`. Unknown IDs return `404`.

### `GET /contracts/filters`

Returns distinct values available for list filters from `vw_contracts_full`.

```json
{
  "vendors": [],
  "departments": [],
  "communities": [],
  "fiscalYears": [],
  "contractTypes": [],
  "tenderClasses": [],
  "projectManagers": []
}
```


### `POST /feedback`

Stores a user feedback/contact submission in `app_feedback`. The endpoint trims and sanitizes text inputs, validates required fields, stores optional page/search context as JSON, and returns only non-sensitive metadata. It does not echo the submitted email address or message.

Request body:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "message": "The filters were helpful, but I expected clearer empty-state guidance.",
  "context": {
    "url": "http://localhost:3000/?q=roads",
    "search": "q=roads"
  }
}
```

Successful response:

```json
{
  "id": 42,
  "status": "new",
  "created_at": "2026-06-12T00:00:00.000Z"
}
```

Invalid submissions return `400` with validation details. Apply the local feedback table before using this endpoint against a new database:

```bash
psql "$DATABASE_URL" -f infra/sql/feedback.sql
```

## Full-text search index

The `q` parameter prefers a PostgreSQL table named `contract_search_index` plus the `tags`, `contract_tags`, and `search_synonyms` enrichment tables. If an enrichment/index table is missing, the API falls back to a direct parameterized `ILIKE` search over `vw_contracts_full` so contract search degrades functionally instead of failing. Apply the SQL setup in `infra/sql/contract_search_index.sql` and `infra/sql/tags_and_search_synonyms.sql` after `vw_contracts_full` and `contract_records` exist to enable indexed full-text ranking, tag matching, and synonym expansion:

```bash
psql "$DATABASE_URL" -f infra/sql/contract_search_index.sql
psql "$DATABASE_URL" -f infra/sql/tags_and_search_synonyms.sql
```

Rebuild the index from `vw_contracts_full` whenever contract source data changes:

```bash
DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api rebuild:contract-search-index
```

If pgvector is available, `infra/sql/contract_search_index.sql` also adds a nullable `embedding vector(384)` column for semantic-search preparation. Populate local deterministic mock embeddings without external services with:

```bash
DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api generate-embeddings
```

See [docs/search.md](search.md) for the semantic-search provider interface, mock embedding flow, and where a real embedding provider should be connected later.

The index stores `search_text`, a weighted `search_vector`, and `last_indexed_at`. It combines contract description, vendor, department, community, contract/tender metadata, fiscal year, amount, project manager, work community, postal code, Yukon/YFN business flags, and SOA number. The fallback path is intended for resilience only; validate performance with the index on any 500k+ record environment.

## Schema inspection helper

A read-only schema inspection script is available:

```bash
pnpm --filter @yukon-connect/api inspect:schema
```

If `DATABASE_URL` is missing, the script prints instructions and exits successfully without attempting a database connection. When `DATABASE_URL` is set, it reads `information_schema` metadata and writes `docs/schema-inspection.json` by default. It does not execute `DROP`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, or data-modifying statements.

## Security and performance

See [docs/security-performance.md](security-performance.md) for the SQL injection review, CORS/rate-limit configuration, structured error logging policy, index recommendations, and production hardening checklist.
