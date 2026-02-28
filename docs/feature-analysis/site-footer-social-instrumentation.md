# Site Footer Social Instrumentation

## Summary
Added analytics instrumentation to site-footer social links to improve attribution of trust and discovery traffic.

## Changes
- Replaced plain external links with `TrackedLink` for:
  - GitHub (`location: site_footer_social_github`)
  - Twitter (`location: site_footer_social_twitter`)
- Event taxonomy:
  - `eventName: landing_secondary_cta_click`
  - `variant: control`
- Preserved external-link hardening (`target="_blank"` + `rel="noopener noreferrer"`).

## Impact
- Better visibility into footer-driven engagement.
- No UX regression; links keep existing behavior.
