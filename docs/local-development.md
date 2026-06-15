# Local development

This guide describes two supported local development modes.

## Before you start

```bash
pnpm install
cp .env.example .env
```

Edit `.env` locally. Never commit real database passwords, Supabase credentials, or generated Strapi secrets.

## Mode A: API local + frontend local + cloud database

Use this mode when you want the local app to read real data from an existing PostgreSQL/Supabase database.

1. Prefer staging or a recent production copy. Do not point local development at production unless you intentionally accept the risk.
2. Set `DATABASE_URL` in `.env` to the cloud PostgreSQL connection string.
3. For Supabase/cloud PostgreSQL, set SSL options when required:

```bash
DATABASE_SSL=true
PGSSLMODE=require
```

4. Check the connection safely:

```bash
pnpm db:check
```

5. Inspect the schema without changing data:

```bash
pnpm db:inspect
```

6. Start the API:

```bash
pnpm --filter @yukon-connect/api dev
```

7. In another terminal, start the frontend:

```bash
API_BASE_URL=http://localhost:3001 NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @yukon-connect/frontend dev
```

The API starts even when `DATABASE_URL` is missing. `/health` reports the database status, and database-backed endpoints return clear `503` errors until the URL is configured.

### Search index rebuilds

If the search-index SQL function exists, rebuilding the contract search index is a data-modifying operation and must be run only by a developer who has manually confirmed the target database:

```bash
pnpm --filter @yukon-connect/api rebuild:contract-search-index
```

Do not run this command automatically in startup scripts, CI, or against production without an approved maintenance plan.

## Mode B: all local with Docker PostgreSQL

Use this mode when you want isolated local infrastructure.

1. In `.env`, use local Docker values:

```bash
POSTGRES_DB=yukon_connect
POSTGRES_USER=yukon
POSTGRES_PASSWORD=change-me-in-your-local-env
DATABASE_URL=postgresql://yukon:change-me-in-your-local-env@localhost:5432/yukon_connect
DATABASE_SSL=false
PGSSLMODE=disable
```

2. Start PostgreSQL:

```bash
docker compose up -d postgres
```

3. Check the local connection:

```bash
pnpm db:check
```

4. Start the API and frontend:

```bash
pnpm --filter @yukon-connect/api dev
pnpm --filter @yukon-connect/frontend dev
```

Docker Compose does not run migrations automatically. Apply SQL files manually only when you intentionally want to create or change local objects.

## Strapi

Run Strapi only when you need the CMS/admin surface:

```bash
pnpm --filter @yukon-connect/strapi dev
```

Set `STRAPI_DATABASE_URL` if Strapi should use a different database from the API. Strapi may create or update its own CMS tables, so prefer a local or staging database for Strapi development.
