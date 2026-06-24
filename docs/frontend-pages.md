# Frontend Pages

## Routes

- `/` renders the Strapi Homepage single type.
- `/search?q=` keeps the existing contracts search UI and calls the contracts API through Next rewrites.
- `/<slug>` fetches a Strapi Page by slug and renders the report/basic page layout. `fiscal-year-trend` has local fallback content.

## Environment variables

- `STRAPI_URL` is used by server-side fetches to Strapi.
- `NEXT_PUBLIC_STRAPI_URL` is only a fallback for environments that expose Strapi publicly.
- `NEXT_PUBLIC_API_URL` or `API_BASE_URL` points Next rewrites at the contracts API.

## Search behavior

The homepage search form navigates to `/search?q=<query>`. Category links navigate to `/search?q=services`, `/search?q=goods`, and `/search?q=construction`. Contract data stays outside Strapi.
