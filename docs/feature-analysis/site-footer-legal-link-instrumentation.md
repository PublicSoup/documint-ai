# Site Footer Legal Link Instrumentation

## Summary
Added attribution instrumentation to the Legal section links in `SiteFooter`.

## Changes
Replaced plain links with `TrackedLink` for:
- Terms of Service (`site_footer_legal_terms`)
- Privacy Policy (`site_footer_legal_privacy`)
- Security (`site_footer_legal_security`)
- Cookie Policy (`site_footer_legal_cookies`)

Event taxonomy:
- `eventName: landing_secondary_cta_click`
- `variant: control`

## Why this matters
- Improves visibility into legal/trust navigation behavior.
- Strengthens attribution coverage for compliance-oriented user journeys.
