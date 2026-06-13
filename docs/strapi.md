# Strapi CMS/Admin

Yukon Connect uses Strapi as an editorial CMS and administration surface, not as the primary contract search engine or contract data store.

## Scope

Strapi is configured for:

- site content pages;
- editorial configuration;
- search tag administration;
- search synonym administration;
- informational content;
- user contact or feedback submissions.

Contract search remains owned by the Yukon Connect API, PostgreSQL contract tables, and the dedicated search/indexing code. Do not duplicate contract records, contract search ranking, or the contract search index inside Strapi.

## Content types

The Strapi app defines these collection types:

| Content type | Fields | Notes |
| --- | --- | --- |
| `Page` | `title`, `slug`, `body`, `publishedAt` | `publishedAt` is provided by Strapi draft-and-publish. |
| `SearchTag` | `name`, `slug`, `category`, `description` | Editorial tags for UI/filter metadata. |
| `SearchSynonym` | `term`, `synonym`, `category` | Editorial synonym list that can inform search UX/preprocessing. |
| `Feedback` | `name`, `email`, `message`, `context`, `status` | Contact/feedback submissions. |

## Local configuration

Copy the example environment file and replace placeholder secrets before local development:

```bash
cp .env.example .env
```

Strapi reads PostgreSQL from `DATABASE_URL` first and then `STRAPI_DATABASE_URL`. In Docker Compose, `STRAPI_DATABASE_URL` points at the `postgres` service by default:

```env
STRAPI_DATABASE_URL=postgresql://yukon:change-me-in-your-local-env@postgres:5432/yukon_connect
STRAPI_DATABASE_SSL=false
```

For hosted PostgreSQL providers that require SSL, set:

```env
STRAPI_DATABASE_SSL=true
```

The local `.env.example` also includes Strapi secret variables. Generate unique values for shared environments and never commit real secrets.

## Run locally

Install dependencies from the repository root:

```bash
pnpm install
```

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Run Strapi directly from the workspace:

```bash
DATABASE_URL="postgresql://yukon:<your-local-password>@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/strapi dev
```

Alternatively, run Strapi with Docker Compose after dependencies are available or when you want Compose to install them in the container:

```bash
docker compose --profile apps up strapi
```

## Admin access

Open the Strapi admin at:

```text
http://localhost:1337/admin
```

On the first run, Strapi prompts you to create the first administrator account. Use your local development email and password. Subsequent access uses that admin account.

After login, go to **Content Manager** to manage `Page`, `SearchTag`, `SearchSynonym`, and `Feedback` entries.
