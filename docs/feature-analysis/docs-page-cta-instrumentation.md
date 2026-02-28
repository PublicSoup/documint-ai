# Docs Page CTA Instrumentation

## Summary
Added conversion analytics instrumentation for key CTA paths on the public `/docs` page.

## Shipped
- Section CTA tracking:
  - `docs_getting_started` → `landing_primary_cta_click`
  - `docs_web_ide` → `landing_secondary_cta_click`
  - `docs_security_compliance` → `landing_secondary_cta_click`
- Final CTA block tracking:
  - `docs_final_cta` → `landing_final_cta_click`
  - `docs_back_home` → `landing_secondary_cta_click`
- All events tagged with `variant="control"` for experiment consistency.

## Why it matters
- Extends attribution coverage beyond landing page into documentation-assisted conversion flows.
- Improves visibility into how informational pages influence signup/trial actions.

## Estimated business impact
- Acquisition: low-medium
- Activation: medium
- Paid conversion: medium
- Retention: low
