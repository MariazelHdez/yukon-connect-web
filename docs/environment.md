# Environment variables

Yukon Connect must run without committed secrets. Copy `.env.example` to `.env`, keep `.env` untracked, and put real cloud database credentials only in your local shell, local `.env`, or a secrets manager.

## Required for cloud PostgreSQL/Supabase development

| Variable | Used by | Required? | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, database scripts, Strapi fallback | Yes for database-backed endpoints | PostgreSQL connection string. For Supabase, use the recommended application/pooler URL for app traffic and include SSL settings when required. |
| `DIRECT_DATABASE_URL` | Manual tools only | No | Optional direct/non-pooler URL. The repo does not use this automatically. Use only when a tool explicitly requires a direct connection. |
| `DATABASE_SSL` | API/db scripts/Strapi | Usually for cloud DBs | Set `true` for hosted PostgreSQL that requires SSL. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | API/db scripts/Strapi | No | Keep `true` by default. Set `false` only if your provider or local certificate setup requires it. |
| `PGSSLMODE` | PostgreSQL clients/scripts | Usually for cloud DBs | `require` is typical for Supabase/cloud PostgreSQL; `disable` is typical for local Docker. |
| `API_PORT` | API | No | Defaults to `3001`. |
| `FRONTEND_PORT` | Frontend docs/commands | No | Defaults to `3000`. |
| `CORS_ORIGIN` | API | No | Browser origin allowed to call the API, usually `http://localhost:3000`. `API_CORS_ORIGIN` and `API_CORS_ORIGINS` are also supported. |
| `NODE_ENV` | Node apps | No | Use `development` locally. |
| `LOG_LEVEL` | Runtime convention | No | Use `info` locally unless debugging. |
| `NEXT_PUBLIC_API_URL` | Frontend | No | Public browser API URL alias. Existing `NEXT_PUBLIC_API_BASE_URL` is also supported. |
| `API_BASE_URL` | Frontend rewrites | No | Server-side Next.js rewrite target; defaults to `http://localhost:3001`. |
| `STRAPI_DATABASE_URL` | Strapi | If Strapi uses separate DB | Set when Strapi should not use `DATABASE_URL`. |

## Safety rules

- Do not commit real `.env` files or cloud credentials.
- Do not run migrations automatically against a cloud database.
- Do not run destructive SQL (`DROP`, `TRUNCATE`, mass `DELETE`, schema recreation) against shared data.
- Use staging or a recent copy before testing anything that can write data.
- Commands that intentionally rebuild or mutate indexes, embeddings, content, or feedback must be run manually and only after you have confirmed the target database.

## Safe read-only checks

`pnpm db:check` only executes:

```sql
select version(), current_database(), current_schema()
```

`pnpm db:inspect` uses PostgreSQL metadata queries against `information_schema` and `pg_catalog` inside a read-only transaction and writes Markdown documentation. It does not modify database data or schema.
