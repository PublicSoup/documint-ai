# Marketing Event Rejection Audit Helper Refactor

## Summary
Refactored duplicated rejection-audit code in `/api/analytics/marketing-event` into a shared helper for consistency and safer maintenance.

## Implemented
- Added `logRejectedMarketingEvent(...)` helper.
- Reused helper for both rejection paths:
  - invalid JSON
  - schema-invalid payload
- Preserved non-blocking audit behavior and existing error envelopes.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** indirect reliability gain via lower telemetry-ingestion maintenance risk.
- **Retention:** improved code consistency and operability.

## Risk
- Very low risk; refactor-only behavior parity.
- Verify/commit remains blocked while exec backend is unavailable.
