# Site Footer Bottom-Link Instrumentation

## Summary
Added conversion/trust-path instrumentation to bottom-bar links in `SiteFooter`.

## Changes
Replaced plain `Link` components with `TrackedLink` for:
- Terms (`location: site_footer_bottom_terms`)
- Privacy (`location: site_footer_bottom_privacy`)
- Security (`location: site_footer_bottom_security`)
- Support (`location: site_footer_bottom_support`)

Event taxonomy:
- `eventName: landing_secondary_cta_click`
- `variant: control`

## Why this matters
- Improves attribution visibility for legal/trust/support navigation paths.
- Helps quantify how footer trust links contribute to retention-oriented behavior.
