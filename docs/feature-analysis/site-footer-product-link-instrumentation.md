# Site Footer Product Link Instrumentation

## Summary
Added attribution instrumentation to Product section links in `SiteFooter`.

## Changes
Replaced plain links with `TrackedLink` for:
- Dashboard (`site_footer_product_dashboard`)
- Analytics (`site_footer_product_analytics`)
- Billing (`site_footer_product_billing`)
- Settings (`site_footer_product_settings`)

Event taxonomy:
- `eventName: landing_secondary_cta_click`
- `variant: control`
