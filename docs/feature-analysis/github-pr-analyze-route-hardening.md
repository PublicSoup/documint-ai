# GitHub PR Analyze Route Hardening

## Summary
Hardened `POST /api/github/pr/analyze` with strict input validation, standardized error envelopes, and explicit rate limiting.

## Changes
- Added strict zod request schema (`owner`, `repo`, `pullNumber`).
- Replaced ad-hoc body checks with `validateBody(...)`.
- Replaced custom unauthorized/failure branches with `ApiErrors` + `errorResponse(...)`.
- Switched to `enforceRateLimit(session.user.id, "api")`.
- Removed route-level console error paths while preserving non-blocking audit logging.

## Why this matters
- Improves consistency and reliability of GitHub PR analysis error handling.
- Reduces malformed-input risk and avoids silent branch divergence.
- Aligns GitHub integration analysis route with enterprise API hardening standards.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
