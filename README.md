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

This repository currently contains the base monorepo structure and Docker Compose configuration for local infrastructure. Business logic, the Next.js frontend, the Node.js API, Strapi implementation, and database search implementation will be added in later iterations.
