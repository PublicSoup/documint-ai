# Marketing Event IP Mask Generalization

## Summary
Generalized IP masking in marketing-event rejection auditing to handle both IPv4 and IPv6 formats.

## Implemented
- Added `maskIpAddress(...)` helper in `/api/analytics/marketing-event`.
- Behavior:
  - IPv4: `a.b.c.d` -> `a.b.c.x`
  - IPv6: keeps first two groups, masks remainder (`xxxx:yyyy::x` style)
- Replaced inline IPv4-only masking logic with shared helper.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct effect; improves privacy consistency in telemetry operations.
- **Retention:** stronger cross-network privacy posture.

## Risk
- Very low risk; invalid-payload audit path only.
- Verify/commit remains blocked while exec backend is unavailable.
