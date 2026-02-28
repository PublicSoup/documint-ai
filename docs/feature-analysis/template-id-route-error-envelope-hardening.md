# Template ID Route Error Envelope Hardening

## Summary
Hardened `PUT/DELETE /api/templates/[id]` by replacing ad-hoc auth/validation/not-found/manual-500 branches with centralized API error handling.

## Changes
- Added `ApiErrors`, `validateBody`, and `errorResponse` usage.
- Replaced manual unauthorized responses with `throw ApiErrors.unauthorized()`.
- Replaced manual param-validation failures with structured `ApiErrors.badRequest(...)`.
- Replaced ambiguous not-found/unauthorized `404` responses with `ApiErrors.notFound("Template")`.
- Replaced route-level catch console logging with centralized `errorResponse(error)`.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
