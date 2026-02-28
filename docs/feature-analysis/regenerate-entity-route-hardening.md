# Regenerate Entity Route Hardening

## Summary
Hardened `POST /api/regenerate-entity` with centralized validation and standardized API error handling.

## Changes
- Added `validateBody(...)` with strict schema and normalized `fileId` limits.
- Replaced ad-hoc unauthorized/forbidden/invalid-payload responses with `ApiErrors`.
- Replaced custom catch + `console.error` with shared `errorResponse(...)`.
- Preserved AI generation behavior and non-blocking audit logging.

## Why this matters
- Improves reliability and consistency for AI regeneration failures.
- Reduces route-level response drift in security-critical auth/permission paths.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
