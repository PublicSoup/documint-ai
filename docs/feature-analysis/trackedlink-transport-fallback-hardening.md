# TrackedLink Transport Fallback Hardening

## Summary
Hardened client-side marketing event transport to gracefully handle `sendBeacon` and network failures without affecting user navigation.

## Implemented
- Wrapped `navigator.sendBeacon` path in `try/catch`.
- Check `sendBeacon` return value; if false, fallback to `fetch` transport.
- Added non-blocking `.catch()` on `fetch` path.

## Expected Impact
- **Acquisition:** more consistent event capture reliability under browser/network edge cases.
- **Activation:** preserves user flow while reducing silent analytics drop from transport exceptions.
- **Paid conversion:** improved continuity of CTA telemetry.
- **Retention:** indirect gain via better analytics fidelity.

## Risk
- Very low risk; transport-resilience improvements only.
- Verify/commit remains blocked while exec backend is unavailable.
