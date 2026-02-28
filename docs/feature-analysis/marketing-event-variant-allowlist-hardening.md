# Marketing Event Variant Allowlist Hardening

## Summary
Hardened `/api/analytics/marketing-event` by adding an allowlist policy for `variant` values to reduce uncontrolled experiment-label drift.

## Implemented
- Added `isAllowedVariantToken(...)` policy:
  - allows `control`
  - allows prefixes: `v...`, `test_...`
- Updated schema so `variant` must satisfy:
  - token regex
  - allowlist policy

## Expected Impact
- **Acquisition:** cleaner experiment attribution dimensions.
- **Activation:** improved consistency in funnel variant analysis.
- **Paid conversion:** better reliability for CTA A/B reporting.
- **Retention:** stronger telemetry governance and lower analytics entropy.

## Risk
- Low risk; current baseline variant (`control`) remains valid.
- Verify/commit remains blocked while exec backend is unavailable.
