# Audit Verify Route Hardening

## Summary
Hardened `GET /api/audit/verify` with centralized query validation, standardized error envelopes, and explicit rate limiting.

## Changes
- Added `validateQuery(...)` with bounded `limit` schema (`1..500`, default `100`).
- Added `enforceRateLimit(session.user.id, "api")`.
- Replaced ad-hoc unauthorized/forbidden/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Removed route-level console logging from catch path.

## Why this matters
- Improves reliability and consistency for admin audit-chain verification.
- Prevents malformed query behavior and normalizes failure contracts.
- Adds abuse protection to a sensitive verification endpoint.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
