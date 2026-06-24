# Yukon Connect

Yukon Connect is a TypeScript monorepo for a web application that will help users search and explore Yukon government contract records.

## Repository layout

```text
apps/
  frontend/   # Next.js contract search frontend
  api/        # Future Node.js TypeScript API
  strapi/     # Strapi CMS/admin app for editorial content, tags, synonyms, and feedback
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


### Strapi CMS/admin

Strapi is configured as the CMS/admin surface for site pages, editorial search tags, editorial search synonyms, informational content, and feedback/contact submissions. It is not the primary contract search engine; contract search remains in the API, PostgreSQL contract tables, and search/indexing code.

Run Strapi locally after installing dependencies and starting PostgreSQL:

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://yukon:<your-local-password>@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/strapi dev
```

Open the admin at <http://localhost:1337/admin>. On first run, create the first administrator account, then use **Content Manager** for `Page`, `SearchTag`, `SearchSynonym`, and `Feedback`. See [docs/strapi.md](docs/strapi.md) for details and [docs/strapi-troubleshooting.md](docs/strapi-troubleshooting.md) for startup troubleshooting.

Validate the Strapi content-type structure before startup when editing CMS APIs:

```bash
pnpm strapi:validate
```

If Strapi reports `Cannot read properties of undefined (reading 'kind')`, clear generated state and validate that every router/controller/service UID has a matching schema:

```bash
rm -rf apps/strapi/.cache apps/strapi/build apps/strapi/dist apps/strapi/.strapi
pnpm strapi:validate
pnpm --filter @yukon-connect/strapi develop --debug
```

The upload directory is preserved by `apps/strapi/public/uploads/.gitkeep`; real uploaded media remains ignored. Strapi v5 also requires `strapi::favicon` in `apps/strapi/config/middlewares.ts`; this repo points it at `apps/strapi/public/favicon.svg`, and `pnpm strapi:validate` checks that the middleware and referenced file are present. Strapi must not manage, truncate, recreate, or import the massive contract records. Contract data remains owned by the main API/backend and PostgreSQL/Supabase.

### Feedback/contact form

The frontend includes a feedback form that posts to the API `POST /feedback` endpoint. Apply the feedback table before testing submissions against a new local database:

```bash
psql "$DATABASE_URL" -f infra/sql/feedback.sql
```

The form sends the current URL/search context with the message, while the API returns only non-sensitive metadata after saving the submission.

### Frontend configuration

The Next.js frontend proxies `/contracts` and `/contracts/filters` to the API service. Set `API_BASE_URL` (server-side rewrite target) or `NEXT_PUBLIC_API_BASE_URL` when the API is not running at `http://localhost:3001`.

```bash
API_BASE_URL=http://localhost:3001 pnpm --filter @yukon-connect/frontend dev
```

Run tests for workspace packages/apps that define a test script:

```bash
pnpm test
```

Run formatters for workspace packages/apps that define a format script:

```bash
pnpm format
```


## Run locally with cloud database

Yukon Connect supports running the API and frontend locally against an existing remote PostgreSQL/Supabase database. **Use staging or a recent copy first; do not point local development at production unless you have explicitly confirmed that this is safe.** Never commit real credentials, and do not put real Supabase/PostgreSQL secrets in this README.

The repository must not run migrations automatically against a cloud database. Destructive operations such as `DROP`, `TRUNCATE`, schema recreation, or data deletion are not part of the local startup flow. Any command that can modify real data, including search-index rebuilds or SQL files under `infra/sql`, must be run manually only after confirming the target database.

### Mode A: API local + frontend local + cloud PostgreSQL/Supabase

```bash
pnpm install
cp .env.example .env
```

Edit `.env` and set at least these local-only values:

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
DATABASE_SSL=true
PGSSLMODE=require
API_PORT=3001
FRONTEND_PORT=3000
CORS_ORIGIN=http://localhost:3000
API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

If your provider gives both pooled and direct URLs, use the pooled/application URL for `DATABASE_URL` unless a tool specifically needs a direct connection. `DIRECT_DATABASE_URL` is documented in `.env.example` for manual tools, but this repo does not use it automatically.

Safely test the remote connection. This command only runs `select version(), current_database(), current_schema()` and does not modify data:

```bash
pnpm db:check
```

Inspect the schema without changing data:

```bash
pnpm db:inspect
```

Start the API:

```bash
pnpm --filter @yukon-connect/api dev
```

Start the frontend in a second terminal:

```bash
API_BASE_URL=http://localhost:3001 NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @yukon-connect/frontend dev
```

Open <http://localhost:3000>. The API also starts without `DATABASE_URL`; `/health` remains available and database-backed endpoints return clear `503` errors until a database URL is configured.

If the search index exists and you intentionally need to rebuild it, run this manually only after confirming the target database because it can modify real data:

```bash
pnpm --filter @yukon-connect/api rebuild:contract-search-index
```

### Mode B: all local with Docker PostgreSQL

Use this mode for isolated local infrastructure. In `.env`, use local Docker values instead of cloud credentials:

```bash
POSTGRES_DB=yukon_connect
POSTGRES_USER=yukon
POSTGRES_PASSWORD=change-me-in-your-local-env
DATABASE_URL=postgresql://yukon:change-me-in-your-local-env@localhost:5432/yukon_connect
DATABASE_SSL=false
PGSSLMODE=disable
```

Start local PostgreSQL, check the connection, then run the apps:

```bash
docker compose up -d postgres
pnpm db:check
pnpm --filter @yukon-connect/api dev
pnpm --filter @yukon-connect/frontend dev
```

Docker Compose starts PostgreSQL only; it does not run migrations automatically. Apply SQL files manually only when you intentionally want to change the local database. See [docs/local-development.md](docs/local-development.md) and [docs/environment.md](docs/environment.md) for more detail.

## GitLab CI/CD

This repository includes a GitLab CI pipeline in `.gitlab-ci.yml` for merge requests and branch pipelines. The pipeline uses Node.js 24, Corepack, pnpm 10.28.1, and a cached pnpm store to avoid downloading dependencies from scratch on every job.

Pipeline stages:

1. `install` validates dependency installation with `pnpm install --frozen-lockfile`.
2. `lint` runs the configured lint script for the frontend, API, and Strapi app.
3. `typecheck` runs TypeScript checks for the frontend, API, and Strapi app.
4. `test` runs frontend and API tests, plus the Strapi test script if one is added later.
5. `build` builds or validates the frontend, API, and Strapi app.

There are no production deployment jobs yet. Lint, typecheck, test, and build jobs must pass before the pipeline is green.

### CI/CD variables

Configure runtime secrets and environment-specific values in **GitLab > Settings > CI/CD > Variables**. Do not hardcode real credentials in `.gitlab-ci.yml`, source files, or committed `.env` files.

| Variable | Required for CI now? | Used by | Notes |
| --- | --- | --- | --- |
| `PNPM_VERSION` | No | CI install jobs | Defaults to `10.28.1` in `.gitlab-ci.yml`; override only when changing the workspace package manager version. |
| `PNPM_STORE_DIR` | No | CI cache | Defaults to `.pnpm-store` in `.gitlab-ci.yml`. |
| `NEXT_TELEMETRY_DISABLED` | No | Frontend CI | Defaults to `1` in `.gitlab-ci.yml`. |
| `STRAPI_TELEMETRY_DISABLED` | No | Strapi CI | Defaults to `true` in `.gitlab-ci.yml`. |
| `API_BASE_URL` | No for current CI, yes for deployed frontend environments | Frontend | Server-side API URL used by Next.js rewrites. Set per environment when preview/staging/production deployment jobs are added. |
| `NEXT_PUBLIC_API_BASE_URL` | No for current CI, yes for deployed frontend environments | Frontend browser bundle | Public API URL exposed to the browser. Set per environment when deployment jobs are added. |
| `DATABASE_URL` | No for current CI, yes for API runtime or database inspection | API, Strapi fallback | PostgreSQL connection string. Store as a masked/protected GitLab variable for real environments. |
| `STRAPI_DATABASE_URL` | No for current CI, yes for Strapi runtime | Strapi | Strapi PostgreSQL connection string when different from `DATABASE_URL`. Store as a masked/protected GitLab variable. |
| `DATABASE_SSL` | No | API/Strapi database connections | Set to `true` for hosted PostgreSQL providers that require SSL. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | Strapi database connections | Optional SSL verification toggle for hosted PostgreSQL. Prefer `true` unless your provider requires otherwise. |
| `APP_KEYS` | No for current CI, yes for Strapi runtime | Strapi | Comma-separated Strapi application keys. Use generated secrets in GitLab variables. |
| `ADMIN_JWT_SECRET` | No for current CI, yes for Strapi runtime | Strapi | Strapi admin JWT secret. Use a generated secret in GitLab variables. |
| `API_TOKEN_SALT` | No for current CI, yes for Strapi runtime | Strapi | Strapi API token salt. Use a generated secret in GitLab variables. |
| `TRANSFER_TOKEN_SALT` | No for current CI, yes for Strapi runtime | Strapi | Strapi transfer token salt. Use a generated secret in GitLab variables. |
| `ENCRYPTION_KEY` | No for current CI, yes for Strapi runtime | Strapi | Strapi encryption key. Use a generated 32-character secret in GitLab variables. |

### Running CI checks locally

Run the same commands that GitLab uses before opening a merge request:

```bash
pnpm install --frozen-lockfile
pnpm --filter @yukon-connect/frontend lint
pnpm --filter @yukon-connect/api lint
pnpm --filter @yukon-connect/strapi lint
pnpm --filter @yukon-connect/frontend typecheck
pnpm --filter @yukon-connect/api typecheck
pnpm --filter @yukon-connect/strapi typecheck
pnpm --filter @yukon-connect/frontend test
pnpm --filter @yukon-connect/api test
pnpm --filter @yukon-connect/strapi run --if-present test
pnpm --filter @yukon-connect/frontend build
pnpm --filter @yukon-connect/api build
pnpm --filter @yukon-connect/strapi build
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

This repository currently contains the base monorepo structure, Docker Compose configuration for local infrastructure, an initial read-only Node.js TypeScript API for contract search, a Next.js frontend for searching and filtering contracts, and a Strapi CMS/admin app for editorial content, tags, synonyms, and feedback. Strapi must not be used as the primary contract search store or as a duplicate contract search engine.

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
