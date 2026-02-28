# Contact Page CTA Instrumentation

## Summary
Added conversion tracking for `/contact` primary and secondary CTAs using `TrackedLink`.

## Shipped
- Primary CTA (`Start Free Trial`) now emits:
  - `eventName: landing_final_cta_click`
  - `location: contact_page_primary`
  - `variant: control`
- Secondary CTA (`Back to Home`) now emits:
  - `eventName: landing_secondary_cta_click`
  - `location: contact_page_back_home`
  - `variant: control`

## Why it matters
- Extends funnel visibility into post-landing sales intent flows.
- Improves attribution for contact-page assisted conversions.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: medium
- Retention: low
