# Marketing Event Audit Non-Blocking Hardening

## Summary
Hardened `/api/analytics/marketing-event` ingestion reliability by making accepted-event audit writes non-blocking.

## Implemented
- Wrapped `MARKETING_EVENT` audit write in `try/catch`.
- Endpoint now still returns `{ ok: true }` even if audit logger is temporarily unavailable.

## Expected Impact
- **Acquisition:** fewer dropped pre-auth conversion events during audit subsystem turbulence.
- **Activation:** improved consistency of CTA event ingestion under partial dependency failures.
- **Paid conversion:** more stable experiment telemetry continuity.
- **Retention:** stronger operational resilience in analytics path.

## Risk
- Low risk; failure mode shifts from hard-fail to graceful-degrade for accepted events.
- Verify/commit remains blocked while exec backend is unavailable.
