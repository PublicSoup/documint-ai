# Audit Route Auth + Query Hardening

## Summary
Hardened `GET/POST /api/audit` by standardizing unauthorized handling and tightening query/body constraints.

## Changes
- Added `ApiErrors` import and replaced ad-hoc unauthorized JSON responses with `throw ApiErrors.unauthorized()` in both handlers.
- Tightened schemas:
  - `action`/`entity`/`userId` now trimmed and bounded
  - schemas set to `.strict()`
- Switched GET query parsing to `request.nextUrl.searchParams` with `validateQuery(...)`.

## Why this matters
- Improves consistency of auth failure envelopes.
- Reduces malformed filter input risk on a sensitive audit endpoint.
- Aligns audit read/export route behavior with enterprise API hardening patterns.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
