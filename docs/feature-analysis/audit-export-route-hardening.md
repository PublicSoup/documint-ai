# Audit Export Route Hardening

## Summary
Hardened `GET /api/audit/export` with strict query validation, explicit rate limiting, and standardized error envelopes.

## Changes
- Added strict query schema via `validateQuery(...)`:
  - `format` enum (`json|csv`)
  - ISO datetime validation for `start`/`end`
  - bounded `action`/`userId`
- Added `enforceRateLimit(session.user.id, "api")`.
- Replaced ad-hoc unauthorized/manual-500 handling with `ApiErrors` + `errorResponse(...)`.
- Removed route-level console logging in catch path.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
