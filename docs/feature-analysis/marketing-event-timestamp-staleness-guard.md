# Marketing Event Timestamp Staleness Guard

## Summary
Added lower-bound timestamp validation in `/api/analytics/marketing-event` to reject stale historical payloads that can pollute current conversion analytics.

## Implemented
- `ts` now fails validation when older than 30 days.
- Works alongside existing future-skew guard (>5 minutes ahead).

## Expected Impact
- **Acquisition:** cleaner near-term funnel analytics.
- **Activation:** reduced risk of replayed/late client payload distortion.
- **Paid conversion:** improves reliability of recent CTA conversion trend analysis.
- **Retention:** indirect gain via better analytics trustworthiness.

## Risk
- Low risk; still tolerant of normal client/network delays.
- Verify/commit remains blocked while exec backend is unavailable.
