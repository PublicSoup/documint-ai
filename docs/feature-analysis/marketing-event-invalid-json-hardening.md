# Marketing Event Invalid JSON Hardening

## Summary
Hardened `/api/analytics/marketing-event` to return a standardized bad-request envelope for malformed JSON bodies.

## Implemented
- Added explicit JSON parse guard:
  - catches `req.json()` parse failures
  - returns `errorResponse(ApiErrors.badRequest("Invalid JSON body"))`
- Keeps existing schema-validation rejection audit logging path intact.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** clearer client error behavior for malformed payloads.
- **Paid conversion:** indirect reliability improvement in event ingestion.
- **Retention:** stronger API consistency and operational predictability.

## Risk
- Very low risk; only affects malformed JSON error path.
- Verify/commit remains blocked while exec backend is unavailable.
