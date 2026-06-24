# Strapi CMS troubleshooting

Yukon Connect uses Strapi only as an editorial CMS. Strapi content types are limited to `Page`, `Feedback`, `SearchTag`, `SearchSynonym`, and a future `Homepage` single type. Contract search records live in the main PostgreSQL/Supabase database and the API/backend; do not import the 500k contract records into Strapi and do not run destructive migrations from Strapi against contract tables.

## Start Strapi

Install dependencies, configure a Strapi-safe PostgreSQL URL in your untracked `.env`, then run:

```bash
pnpm --filter @yukon-connect/strapi develop --debug
```

Strapi can use `STRAPI_DATABASE_URL` when its CMS database should differ from the main `DATABASE_URL`. No secrets should be committed.

## Validate content types

Run the safe file-system validator before starting Strapi after API/content-type changes:

```bash
pnpm strapi:validate
```

The validator checks that:

- every `schema.json` has `kind`, `collectionName`, `info.singularName`, `info.pluralName`, `info.displayName`, `options`, and `attributes`;
- router/controller/service factory UIDs match a real schema;
- there are no stale `api::` references such as `api::homepage.homepage`, `api::feedback-item.feedback-item`, `api::search-synonyms.search-synonym`, or `api::search-tags.search-tag`;
- `apps/strapi/src/api-disabled` does not exist;
- `apps/strapi/public/uploads/.gitkeep` exists;
- the favicon middleware is not pointing at a missing favicon.

## Clear Strapi cache/build state

When Strapi appears to load stale schemas or generated admin output, clear only generated local state:

```bash
rm -rf apps/strapi/.cache apps/strapi/build apps/strapi/dist apps/strapi/.strapi
```

This does not delete database content.

## Fix `Cannot read properties of undefined (reading 'kind')`

This usually means Strapi found a router/controller/service UID whose schema was not registered. Confirm the content type folder shape is exactly:

```text
apps/strapi/src/api/<api-name>/content-types/<content-type-name>/schema.json
apps/strapi/src/api/<api-name>/controllers/<content-type-name>.ts
apps/strapi/src/api/<api-name>/routes/<content-type-name>.ts
apps/strapi/src/api/<api-name>/services/<content-type-name>.ts
```

For current CMS APIs, the only expected UIDs are:

- `api::page.page`
- `api::feedback.feedback`
- `api::search-tag.search-tag`
- `api::search-synonym.search-synonym`

Then run:

```bash
pnpm strapi:validate
rm -rf apps/strapi/.cache apps/strapi/build apps/strapi/dist apps/strapi/.strapi
pnpm --filter @yukon-connect/strapi develop --debug
```

## Missing uploads folder

If upload startup or media handling fails, recreate the preserved folder:

```bash
mkdir -p apps/strapi/public/uploads
touch apps/strapi/public/uploads/.gitkeep
```

Real uploaded files are ignored by git; `.gitkeep` preserves the directory.

## PostgreSQL `ECONNREFUSED`

`ECONNREFUSED` means Strapi could not connect to the configured PostgreSQL host/port. It does not require importing contract data into Strapi.

Check one of these setups:

- local Docker PostgreSQL is running and `STRAPI_DATABASE_URL`/`DATABASE_URL` points at `localhost:5432`;
- cloud PostgreSQL/Supabase credentials are correct and SSL settings match the provider (`STRAPI_DATABASE_SSL` or `DATABASE_SSL`);
- firewalls, VPNs, and pooler/direct hostnames are correct.

Do not use `DROP`, `TRUNCATE`, schema recreation, or contract imports as a connectivity fix.

## Missing required middlewares: `strapi::favicon`

Strapi v5 validates the middleware list and fails startup with `Missing required middlewares in configuration. Add the following middlewares: "strapi::favicon"` when the favicon middleware is removed. Keep `strapi::favicon` alongside the normal Strapi middlewares (`logger`, `errors`, `security`, `cors`, `poweredBy`, `query`, `body`, `session`, and `public`). This repo configures it with `path: 'public/favicon.svg'`, so `apps/strapi/public/favicon.svg` must exist.

After editing middleware config, run:

```bash
pnpm strapi:validate
pnpm --filter @yukon-connect/strapi develop --debug
```

## Missing favicon

Strapi v5 requires `strapi::favicon` in `apps/strapi/config/middlewares.ts`. This repo keeps the required middleware enabled and points it at the committed text asset `apps/strapi/public/favicon.svg` to avoid binary favicon diffs while preventing `ENOENT`. If you change the middleware `path`, commit the referenced file and run `pnpm strapi:validate`.
