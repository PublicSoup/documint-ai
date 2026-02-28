# User Settings Route Hardening

## Summary
Hardened `GET/PATCH /api/user/settings` to align with enterprise API controls for authentication errors, validation, and mutation auditing.

## Changes
- Replaced ad-hoc unauthorized responses with `ApiErrors.unauthorized()`.
- Replaced manual PATCH body parsing with `validateBody(...)` using existing settings schema.
- Replaced ad-hoc catch handling + `console.error` with standardized `errorResponse(...)`.
- Added non-blocking audit logging for settings mutations (`UPDATE_USER_SETTINGS`) with updated field list.

## Why this matters
- Improves consistency of API error envelopes.
- Removes server console noise and hidden divergence in error behavior.
- Strengthens traceability for user settings mutations.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low (indirect)
- Retention: medium (reliability + account trust)
