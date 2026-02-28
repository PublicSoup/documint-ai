# SEO Sitemap + Robots Optimization

## Summary
Added first-class sitemap and robots metadata routes to improve crawlability and reduce indexing of non-public surfaces.

## Shipped
- `src/app/sitemap.ts`
- `src/app/robots.ts`

## What it does
- Publishes public marketing/trust/signup routes in `sitemap.xml`.
- Provides robots directives that:
  - allow core public pages
  - disallow private app surfaces (`/dashboard`, `/api`, `/admin`)
- References canonical sitemap location for search engines.

## Estimated business impact
- Acquisition: medium-high
- Activation: low-medium
- Paid conversion: low-medium
- Retention: low
