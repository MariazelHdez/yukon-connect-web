# Yukon Connect API

The API is a small TypeScript Node.js service under `apps/api`. It only reads from the existing PostgreSQL schema and does not run migrations or destructive SQL.

## Configuration

- `API_PORT`: HTTP port. Defaults to `3001`.
- `DATABASE_URL`: PostgreSQL connection string. If unset, `/health` still works and reports that the database is not configured; contract endpoints return `503`.

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
| `q` | string | Uses PostgreSQL full-text search through `contract_search_index`. Exact `contract_no` matches rank first, followed by vendor/project manager matches, then description and metadata full-text matches. Results include a numeric `score`. |
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
      "score": 0.42
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 100
  }
}
```

Invalid query parameters return `400` with a `details` array.

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

## Full-text search index

The `q` parameter prefers a PostgreSQL table named `contract_search_index`. If that table is missing, the API falls back to a direct parameterized `ILIKE` search over `vw_contracts_full` so contract search degrades functionally instead of failing. Apply the SQL setup in `infra/sql/contract_search_index.sql` after `vw_contracts_full` exists to enable indexed full-text ranking:

```bash
psql "$DATABASE_URL" -f infra/sql/contract_search_index.sql
```

Rebuild the index from `vw_contracts_full` whenever contract source data changes:

```bash
DATABASE_URL="postgresql://yukon:change-me@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api rebuild:contract-search-index
```

The index stores `search_text`, a weighted `search_vector`, and `last_indexed_at`. It combines contract description, vendor, department, community, contract/tender metadata, fiscal year, amount, project manager, work community, postal code, Yukon/YFN business flags, and SOA number. The fallback path is intended for resilience only; validate performance with the index on any 500k+ record environment.

## Schema inspection helper

A read-only schema inspection script is available:

```bash
pnpm --filter @yukon-connect/api inspect:schema
```

If `DATABASE_URL` is missing, the script prints instructions and exits successfully without attempting a database connection. When `DATABASE_URL` is set, it reads `information_schema` metadata and writes `docs/schema-inspection.json` by default. It does not execute `DROP`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, or data-modifying statements.
