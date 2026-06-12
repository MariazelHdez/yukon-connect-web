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

## Current status

This repository currently contains the base monorepo structure only. Business logic, the Next.js frontend, the Node.js API, Strapi, Docker Compose services, and database search implementation will be added in later iterations.
