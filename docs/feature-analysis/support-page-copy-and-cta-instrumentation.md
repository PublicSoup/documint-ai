# Support Page Copy + CTA Instrumentation

## Summary
Polished `/support` UX by fixing a broken support-contact sentence and adding conversion attribution on key support-path links.

## Changes
- Fixed support copy bug (`contact the team at support`) to explicit email link.
- Added tracked CTA on Security Overview link:
  - `eventName: landing_secondary_cta_click`
  - `location: support_page_security_overview`
- Added tracked CTA on Docs link:
  - `eventName: landing_secondary_cta_click`
  - `location: support_page_docs`

## Why this matters
- Removes confusing support copy in a trust-critical page.
- Improves attribution visibility for support-assisted navigation to trust/docs paths.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low-medium
- Retention: medium
