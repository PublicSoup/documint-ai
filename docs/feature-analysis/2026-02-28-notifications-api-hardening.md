# 2026-02-28 — Notifications API Hardening (Privacy + Input Safety)

## Scope
Hardened `src/app/api/notifications/route.ts` for enterprise API parity with stricter mutation semantics, standardized validation, and response privacy controls.

## Changes
- Switched query/body validation to shared `validateQuery` + `validateBody` helpers for consistent error envelopes.
- Tightened PATCH payload contract:
  - requires either `id` OR `markAllRead=true`
  - rejects ambiguous payloads that include both
- Added no-store response policy across notifications endpoints via shared helper:
  - `Cache-Control: no-store, max-age=0`
- Preserved authn/rate-limit/audit behavior for notification mutations.

## Security/Reliability Value
- Reduces ambiguous mutation requests and unintended state transitions.
- Prevents intermediary/browser caching of user notification payloads and unread metadata.
- Improves validation consistency across API routes for predictable client handling.

## Enterprise Impact Estimate
- **Acquisition:** Low-Medium (better security posture narrative).
- **Activation:** Medium (fewer edge-case notification UX failures from malformed requests).
- **Paid conversion:** Low direct impact.
- **Retention:** Medium-High (more reliable and privacy-safe notification center behavior).

## Verification
- `npm run build` ✅ passed.

## Risk Notes
- PATCH callers that previously sent both `id` and `markAllRead=true` will now receive validation errors (intended contract tightening).
