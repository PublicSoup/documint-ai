# Landing Footer Legal-Link Instrumentation

## Summary
Added attribution instrumentation to legal links in the landing page footer.

## Changes
Replaced plain links with `TrackedLink` for:
- Privacy Policy (`landing_footer_legal_privacy`)
- Terms of Service (`landing_footer_legal_terms`)
- Refund Policy (`landing_footer_legal_refund`)

Event taxonomy:
- `eventName: landing_secondary_cta_click`
- `variant: LANDING_EXPERIMENT_VARIANT`

## Why this matters
- Improves visibility into trust/legal navigation behavior from top-of-funnel users.
- Supports better attribution for conversion journeys that pass through legal pages.
