# Security Page CTA Instrumentation

## Summary
Added conversion tracking to key CTAs on the public `/security` page.

## Shipped
- Primary CTA (`Start Free Trial`):
  - `eventName: landing_final_cta_click`
  - `location: security_page_primary`
  - `variant: control`
- Secondary CTA (`Request Security Review`):
  - `eventName: landing_secondary_cta_click`
  - `location: security_page_contact_review`
  - `variant: control`

## Why this matters
- Captures enterprise trust-path intent from security-minded evaluators.
- Improves attribution for conversion actions originating from trust/compliance content.

## Estimated business impact
- Acquisition: low-medium
- Activation: medium
- Paid conversion: medium
- Retention: low
