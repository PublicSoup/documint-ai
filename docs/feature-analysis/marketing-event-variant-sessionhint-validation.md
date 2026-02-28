# Marketing Event Variant + SessionHint Validation Hardening

## Summary
Tightened analytics ingestion validation for experiment metadata fields to keep conversion telemetry clean and query-safe.

## Implemented
- `/api/analytics/marketing-event` schema updates:
  - `variant` must match lowercase token format: `^[a-z0-9_\-]+$`
  - `sessionHint` must match constrained safe charset: `^[a-zA-Z0-9_\-:.]+$`

## Expected Impact
- **Acquisition:** cleaner experiment attribution data.
- **Activation:** improved consistency in pre-auth funnel event dimensions.
- **Paid conversion:** more reliable variant-level CTA comparisons.
- **Retention:** indirect gain through higher analytics integrity.

## Risk
- Low risk validation tightening; existing generated values already conform.
- Verify/commit remains blocked until exec backend is restored.
