# Conversion Event Schema Implementation v1

## Summary
Implemented schema-v1 support in production tracking paths so upcoming A/B tests can attach variant metadata without breaking existing event pipelines.

## Implemented
- Extended `TrackedLink` to support optional:
  - `variant`
  - `sessionHint`
- Extended `POST /api/analytics/marketing-event` validation to accept and constrain those fields.
- Persisted new fields to audit event details for dashboard/query compatibility.

## Expected Impact
- **Acquisition:** Faster experimentation loop on landing messaging variants.
- **Activation:** Better attribution for which CTA copy variants drive signup starts.
- **Paid conversion:** Enables pricing/offer variant comparisons with consistent event schema.
- **Retention:** Indirect; improved acquisition quality through data-driven optimization.

## Risk
- Verify/commit remains blocked until shell backend recovery (`exec denied: allowlist miss`).
