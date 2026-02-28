# Marketing Event Enum Validation

## Summary
Strengthened marketing event ingestion by moving event-name allowlisting into Zod schema-level enum validation.

## Implemented
- Added `allowedEventNames` as a typed constant tuple.
- Replaced free-form `eventName` string validation with `z.enum(allowedEventNames)`.
- Removed duplicate runtime `Set` check branch; validation now fails early and uniformly.

## Expected Impact
- **Acquisition:** cleaner event taxonomy supports faster funnel diagnostics.
- **Activation:** reduces malformed event drift in pre-signup instrumentation.
- **Paid conversion:** more reliable CTA attribution continuity across experiments.
- **Retention:** indirect improvement from better analytics correctness.

## Risk
- Low risk; supported event names unchanged.
- Verify/commit remains blocked while exec backend is unavailable.
