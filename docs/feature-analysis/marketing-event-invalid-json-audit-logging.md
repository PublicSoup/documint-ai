# Marketing Event Invalid-JSON Audit Logging

## Summary
Added non-blocking audit visibility for malformed JSON submissions to `/api/analytics/marketing-event`.

## Implemented
- On JSON parse failure:
  - writes `MARKETING_EVENT_REJECTED` audit record
  - `entityId: invalid_json`
  - `details.reason: invalid_json`
  - uses masked IP
- Returns standardized bad-request envelope (`Invalid JSON body`).

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** faster diagnosis of broken client telemetry senders.
- **Paid conversion:** improved confidence in conversion-event ingestion quality.
- **Retention:** stronger operational observability and incident triage.

## Risk
- Very low risk; malformed-payload path only.
- Verify/commit remains blocked while exec backend is unavailable.
