# Schedule Route Error-Path Normalization

## Summary
Hardened `GET/PUT/POST /api/schedule` by normalizing inline `return errorResponse(ApiErrors...)` branches to thrown `ApiErrors` with centralized catch handling.

## Changes
- Replaced inline unauthorized responses with `throw ApiErrors.unauthorized()` in all three handlers.
- Replaced inline host-validation error response with `throw ApiErrors.badRequest("Missing request host.")` in manual trigger flow.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
