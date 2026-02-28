# Marketing Event Timestamp Constants Hardening

## Summary
Refactored timestamp guard windows in `/api/analytics/marketing-event` into named constants for safer maintenance and reduced policy drift.

## Implemented
- Added:
  - `MAX_FUTURE_SKEW_MS`
  - `MAX_EVENT_AGE_MS`
- Replaced inline millisecond literals in `ts` validation refinements.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** indirect reliability benefit via clearer validation policy maintenance.
- **Retention:** improved maintainability for telemetry integrity controls.

## Risk
- Very low risk; refactor-only behavior parity.
- Verify/commit remains blocked while exec backend is unavailable.
