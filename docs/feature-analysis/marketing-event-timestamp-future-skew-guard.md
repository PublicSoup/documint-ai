# Marketing Event Timestamp Future-Skew Guard

## Summary
Added validation guardrails to reject marketing events with timestamps excessively ahead of server time.

## Implemented
- Updated `/api/analytics/marketing-event` schema:
  - `ts` now fails validation if more than 5 minutes in the future.

## Expected Impact
- **Acquisition:** cleaner top-of-funnel analytics quality.
- **Activation:** reduces skewed event ordering from malformed client payloads.
- **Paid conversion:** improves reliability of time-series conversion analysis.
- **Retention:** indirect gain via more trustworthy instrumentation data.

## Risk
- Low risk; allows small clock skew while rejecting implausible future timestamps.
- Verify/commit remains blocked while exec backend is unavailable.
