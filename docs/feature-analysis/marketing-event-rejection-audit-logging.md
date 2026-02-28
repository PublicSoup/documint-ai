# Marketing Event Rejection Audit Logging

## Summary
Added audit visibility for rejected `/api/analytics/marketing-event` payloads to improve abuse detection and debugging of malformed client events.

## Implemented
- On schema validation failure, route now attempts non-blocking audit log write:
  - `action: MARKETING_EVENT_REJECTED`
  - `entity: LandingPage`
  - includes validation issue path/message details
  - captures source IP
- Preserves standardized error envelope response.

## Expected Impact
- **Acquisition:** cleaner funnel ops via faster diagnosis of instrumentation regressions.
- **Activation:** reduced time to detect malformed client-event rollouts.
- **Paid conversion:** stronger telemetry trust when running CTA experiments.
- **Retention:** improved security/observability posture.

## Risk
- Low risk; additional non-blocking audit write on invalid payload path only.
- Verify/commit remains blocked while exec backend is unavailable.
