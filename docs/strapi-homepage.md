# Strapi Homepage Content

Strapi is used only as an editorial CMS for Yukon Connect website content. Do not import contract records into Strapi; contract search remains in the API and PostgreSQL/Supabase.

## Content model

The Homepage single type contains `title`, `slug`, `hero`, `insightsSection`, `footer`, and `seo`. The hero component controls the eyebrow, title, background media, search placeholder, search button, categories, and built-by badge. The insights section controls report cards that link to frontend pages.

## Editing and publishing

1. Start Strapi with `pnpm --filter @yukon-connect/strapi develop --debug`.
2. Open the Strapi admin.
3. Edit **Content Manager → Single Types → Homepage**.
4. Update the hero, category links, report cards, footer, and SEO fields.
5. Save and publish. Draft content is not served by default.

## Frontend fetching

The Next.js homepage fetches `/api/homepage` using `STRAPI_URL` on the server. If Strapi is unavailable in development, local fallback content is rendered so the app remains readable.
