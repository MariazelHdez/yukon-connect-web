# Yukon Connect

Yukon Connect is a TypeScript monorepo for a web application that will help users search and explore Yukon government contract records.

## Repository layout

```text
apps/
  frontend/   # Future Next.js frontend
  api/        # Future Node.js TypeScript API
  strapi/     # Future Strapi CMS/admin app
packages/
  shared/     # Shared TypeScript types, schemas, and utilities
infra/
  docker/     # Docker-related configuration
  sql/        # SQL migrations, views, and database setup scripts
docs/         # Project documentation
```

## Prerequisites

- Node.js 24 or newer is recommended for local development in this environment.
- pnpm is the configured package manager.

If pnpm is not available locally, enable it with Corepack:

```bash
corepack enable
corepack prepare pnpm@10.28.1 --activate
```

## Local development

Install dependencies from the repository root:

```bash
pnpm install
```

Run all development servers once the individual apps have been scaffolded:

```bash
pnpm dev
```

Build all workspace packages/apps that define a build script:

```bash
pnpm build
```

Run lint checks for workspace packages/apps that define a lint script:

```bash
pnpm lint
```

Run tests for workspace packages/apps that define a test script:

```bash
pnpm test
```

Run formatters for workspace packages/apps that define a format script:

```bash
pnpm format
```


## Docker Compose for local development

The repository includes a Docker Compose setup for local development services. PostgreSQL starts by default; pgAdmin and the application placeholders are opt-in profiles.

Create your local environment file from the example before starting services:

```bash
cp .env.example .env
```

Edit `.env` and replace placeholder passwords with local-only values. Do not commit real secrets.

Start PostgreSQL:

```bash
docker compose up -d
```

Check service status:

```bash
docker compose ps
```

Connect to PostgreSQL from your host machine with the values in `.env`:

```bash
psql "postgresql://yukon:<your-local-password>@localhost:5432/yukon_connect"
```

Start optional pgAdmin at <http://localhost:5050>:

```bash
docker compose --profile tools up -d pgadmin
```

Start the prepared API, frontend, and Strapi placeholder services after those apps are scaffolded or when you want to validate the compose topology:

```bash
docker compose --profile apps up -d
```

Stop and remove local containers while keeping the database volume:

```bash
docker compose down
```

Stop containers and remove persisted PostgreSQL/pgAdmin data volumes:

```bash
docker compose down -v
```

## Current status

This repository currently contains the base monorepo structure, Docker Compose configuration for local infrastructure, and an initial read-only Node.js TypeScript API for contract search. The Next.js frontend and Strapi CMS/admin app are still placeholders for later iterations, and Strapi must not be used as the primary contract search store.

## Database schema inspection

This repository includes a read-only PostgreSQL/Supabase schema inspection script for documenting the current database structure without creating migrations or changing data.

### Configure `DATABASE_URL`

Set `DATABASE_URL` to the PostgreSQL connection string for the database you want to inspect. Use a local copy, staging database, or the real database only when you intentionally choose to run the inspection there.

```bash
export DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>"
```

For Supabase or other hosted PostgreSQL providers that require SSL, enable SSL for the connection:

```bash
export PGSSLMODE=require
# or
export DATABASE_SSL=true
```

Do not commit real database credentials. Keep them in your shell environment, a local untracked `.env`, or your secrets manager.

### Run the inspection

Install dependencies, then run the root workspace command:

```bash
pnpm install
pnpm db:inspect
```

The command runs `apps/api/scripts/inspect-database-schema.ts`, connects with `DATABASE_URL`, reads metadata from `information_schema` and `pg_catalog`, and writes the generated report to:

```text
docs/database-current.md
```

The generated document includes detected schemas, tables, columns, types, nullability, primary keys, foreign keys, indexes, views, view definitions, expected Yukon Connect objects that were not found, and the generation timestamp.

### If there is no database connection

This project does not require Codex or CI to have access to the real database. If `DATABASE_URL` is missing, the script prints a clear message and does not generate `docs/database-current.md`.

If your connection fails locally:

1. Confirm the host, port, database, username, and password in `DATABASE_URL`.
2. Confirm your IP address or network is allowed by the PostgreSQL/Supabase project.
3. Enable SSL with `PGSSLMODE=require` or `DATABASE_SSL=true` if your provider requires it.
4. Re-run `pnpm db:inspect` against a local copy, staging, or production database when you are ready.

### Safety warning

`pnpm db:inspect` is intentionally read-only. It only executes metadata `SELECT` queries inside a read-only transaction. It must not run `DROP TABLE`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, `INSERT`, `UPDATE`, or `DELETE`, and it does not create migrations.

## API contract search service

The repository now includes a TypeScript Node.js API in `apps/api` for read-only contract search against the existing PostgreSQL schema.

Useful commands:

```bash
pnpm --filter @yukon-connect/api start
pnpm --filter @yukon-connect/api test
pnpm --filter @yukon-connect/api inspect:schema
```

See [docs/api.md](docs/api.md) for endpoint documentation, accepted filters, response shapes, and local schema inspection instructions.
