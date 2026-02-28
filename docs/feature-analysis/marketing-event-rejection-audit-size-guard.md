# Marketing Event Rejection Audit Size Guard

## Summary
Added bounds to rejected-payload audit details to reduce oversized audit entries while preserving diagnostic signal.

## Implemented
- In `/api/analytics/marketing-event` rejection audit logging:
  - cap serialized issue list to first 10 validation issues
  - include total `issueCount` for full error cardinality

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** keeps telemetry diagnostics useful without inflating audit payload size.
- **Paid conversion:** indirect reliability improvement in analytics operations.
- **Retention:** stronger operational stability and log hygiene.

## Risk
- Very low risk; only affects rejected-payload audit detail shape.
- Verify/commit remains blocked while exec backend is unavailable.
