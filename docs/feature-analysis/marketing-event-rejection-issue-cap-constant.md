# Marketing Event Rejection Issue-Cap Constant

## Summary
Refactored rejected-event audit issue capping to use a named constant for easier policy maintenance.

## Implemented
- Added `MAX_REJECTION_ISSUES_LOGGED` in `/api/analytics/marketing-event`.
- Replaced inline `slice(0, 10)` with `slice(0, MAX_REJECTION_ISSUES_LOGGED)`.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** indirect maintainability gain for telemetry ops.
- **Retention:** improved code clarity and lower policy-drift risk.

## Risk
- Very low risk; refactor-only behavior parity.
- Verify/commit remains blocked while exec backend is unavailable.
