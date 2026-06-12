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
| `q` | string | Case-insensitive search across contract number, description, vendor, department, community, and project manager. |
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
  "data": [],
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

## Schema inspection helper

A read-only schema inspection script is available:

```bash
pnpm --filter @yukon-connect/api inspect:schema
```

If `DATABASE_URL` is missing, the script prints instructions and exits successfully without attempting a database connection. When `DATABASE_URL` is set, it reads `information_schema` metadata and writes `docs/schema-inspection.json` by default. It does not execute `DROP`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, or data-modifying statements.
