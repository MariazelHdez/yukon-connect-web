# Strapi Troubleshooting

## Validate content types

Run `pnpm --filter @yukon-connect/strapi strapi:validate` before starting Strapi. The validator checks schema metadata, router UID references, disabled API folders, uploads, and favicon configuration.

## Fix `Cannot read properties of undefined (reading 'kind')`

This error usually means Strapi loaded an API router whose UID has no matching schema, or a schema is missing `kind`. Ensure every API follows `src/api/<api>/content-types/<type>/schema.json` and that controllers, routes, and services use the same UID.

## Upload folder missing

Ensure `apps/strapi/public/uploads/.gitkeep` exists. Real uploaded media is ignored by Git, while `.gitkeep` preserves the folder.

## ECONNREFUSED database errors

Set `STRAPI_DATABASE_URL` or `DATABASE_URL` to a reachable local or hosted PostgreSQL database before running Strapi. The validation script does not connect to the database.

## Favicon missing

The middleware list does not enable `strapi::favicon` by default. If you add it later, also add `apps/strapi/favicon.png` or update the configured path.

## Clear Strapi cache

Stop Strapi and remove `apps/strapi/.cache`, `apps/strapi/.tmp`, and `apps/strapi/build`, then restart Strapi. Do not remove uploaded media or database data.
## Missing required middlewares: `strapi::favicon`

Strapi v5 validates the middleware list and fails startup with `Missing required middlewares in configuration. Add the following middlewares: "strapi::favicon"` when the favicon middleware is removed. Keep `strapi::favicon` alongside the normal Strapi middlewares (`logger`, `errors`, `security`, `cors`, `poweredBy`, `query`, `body`, `session`, and `public`). This repo configures it with `path: 'public/favicon.svg'`, so `apps/strapi/public/favicon.svg` must exist.

After editing middleware config, run:

```bash
pnpm strapi:validate
pnpm --filter @yukon-connect/strapi develop --debug
```

## Missing favicon

Strapi v5 requires `strapi::favicon` in `apps/strapi/config/middlewares.ts`. This repo keeps the required middleware enabled and points it at the committed text asset `apps/strapi/public/favicon.svg` to avoid binary favicon diffs while preventing `ENOENT`. If you change the middleware `path`, commit the referenced file and run `pnpm strapi:validate`.
