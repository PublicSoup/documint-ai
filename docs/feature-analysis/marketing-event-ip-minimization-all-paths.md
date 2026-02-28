# Marketing Event IP Minimization (All Paths)

## Summary
Extended privacy minimization in `/api/analytics/marketing-event` so masked IP storage applies to both accepted and rejected event audit logs.

## Implemented
- Compute `maskedIp` once per request using existing `maskIpAddress(...)` helper.
- Use masked value for:
  - `MARKETING_EVENT` (accepted payloads)
  - `MARKETING_EVENT_REJECTED` (invalid payloads)

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct effect; improves telemetry privacy consistency.
- **Retention:** stronger trust/compliance posture in analytics auditing.

## Risk
- Low risk; audit metadata privacy hardening only.
- Verify/commit remains blocked while exec backend is unavailable.
