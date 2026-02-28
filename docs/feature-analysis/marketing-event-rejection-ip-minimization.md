# Marketing Event Rejection IP Minimization

## Summary
Applied privacy-aware minimization to rejected marketing-event audit logs by masking IPv4 addresses before persistence.

## Implemented
- On invalid payload audit path (`MARKETING_EVENT_REJECTED`):
  - transforms IPv4 `a.b.c.d` into `a.b.c.x`
  - stores masked value in audit log `ip`

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct effect; improves compliance posture for telemetry auditing.
- **Retention:** stronger trust and privacy posture in operational logging.

## Risk
- Low risk; invalid-payload audit path only.
- Verify/commit remains blocked while exec backend is unavailable.
