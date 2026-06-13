# Security and performance review

## API controls implemented

- `GET /contracts` validates pagination before it reaches SQL. `pageSize` defaults to `25` and requests above `100` are rejected with `400`.
- CORS is configured from environment variables. Use `API_CORS_ORIGINS` (comma-separated) or `API_CORS_ORIGIN` (single origin). The default local origin is `http://localhost:3000`; production should set the exact public frontend origin and avoid `*` unless the API is intentionally public without credentials.
- Basic in-memory rate limiting is active for every non-preflight API request. Configure it with `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS`.
- Helmet-style response hardening headers are emitted by the Node API: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, `Content-Security-Policy`, and `Permissions-Policy`. Enable HSTS only behind HTTPS with `API_ENABLE_HSTS=true`.
- Error responses use structured JSON. Unexpected server errors return a generic `Internal server error.` response so database details, connection strings, or other secrets are not exposed to clients.
- Error logs are structured JSON and include only operational metadata: request id, HTTP method, pathname, status code, and error class. They intentionally do not include request bodies, query strings, headers, cookies, emails, feedback messages, `DATABASE_URL`, or other secrets.

## SQL injection review

The API uses PostgreSQL positional parameters for all user-provided values:

- `/contracts` filters are converted into `$1`, `$2`, ... placeholders by `buildWhereClause`.
- The `q` search value is bound into the `search_query` CTE as text and is reused inside SQL expressions from that parameter.
- `limit` and `offset` are bound parameters derived from validated positive integers, with `pageSize` capped at `100`.
- `/contracts/:id` parses IDs as positive integers and binds the ID as `$1`.
- `/feedback` inserts name, email, message, and JSON context with bound parameters.

SQL identifiers cannot be bound as parameters, so filterable column names are server-side allowlisted in code and are never accepted directly from the request.

## Index review

The most important production index is `contract_search_index_search_vector_idx`, a GIN index on `contract_search_index.search_vector`, plus the unique/indexed `contract_record_id` lookup. Those are defined in `infra/sql/contract_search_index.sql`.

Additional indexes to verify on the source tables behind `vw_contracts_full` and `contract_records`:

- `contract_records(id)` primary key or unique index for `/contracts/:id` and joins.
- `contract_records(start_date)` for `startDateFrom` / `startDateTo` filters.
- `created_at desc, id desc` index on the underlying contract row table used by `vw_contracts_full` for default pagination ordering.
- Equality-filter indexes on the underlying columns exposed by `vw_contracts_full`: `vendor`, `department`, `community`, `fiscal_year`, `project_manager`, `contract_type`, and `tender_class`.
- If fallback direct `ILIKE` search is expected to handle large datasets, add trigram GIN indexes on high-value text columns such as `contract_no`, `vendor`, `project_manager`, and `contract_description`; otherwise treat the fallback as resilience only and keep `contract_search_index` rebuilt.

Run the schema inspector against production-like data to confirm actual table/view definitions before adding indexes:

```bash
pnpm --filter @yukon-connect/api db:inspect
```

## Production recommendations

- Terminate TLS before the API and set `API_ENABLE_HSTS=true` only once HTTPS is enforced end-to-end for the public host.
- Set `API_CORS_ORIGINS` to exact frontend origins, for example `https://contracts.example.gov`, not a wildcard.
- Tune `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` per environment. For multi-instance production, replace the in-memory limiter with a shared Redis or gateway/WAF limiter so limits apply across all replicas.
- Keep structured logs but route them to a secure log pipeline with retention controls. Do not add bodies, cookies, authorization headers, emails, feedback messages, or database URLs to logs.
- Rebuild `contract_search_index` after contract source data changes and monitor query latency for `/contracts` with and without `q`.
- Verify PostgreSQL indexes with `EXPLAIN (ANALYZE, BUFFERS)` on production-like data before deploying new indexes broadly.
- Store `DATABASE_URL` and other runtime values in a secrets manager, not in source control or build logs.
