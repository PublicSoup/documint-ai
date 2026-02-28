# Register Route Normalization + Logging Hardening

## Summary
Hardened `POST /api/register` by normalizing identity inputs, tightening rate-limit ordering, and removing production console-noise paths.

## Changes
- Added strict normalization in validation schema:
  - `name` now trims whitespace
  - `email` now trims + lowercases before persistence and lookup
- Reordered rate-limit flow for reliability:
  - IP rate limit first
  - validate payload
  - per-email security rate limit using normalized email
- Removed request pre-parse via `req.clone().json()`.
- Removed catch-block `console.error` logging and stack output.
- Kept audit/email side-effects non-blocking without noisy logs.

## Why this matters
- Prevents case/whitespace-driven duplicate-account edge cases.
- Reduces noisy/error-prone pre-parse behavior on malformed payloads.
- Improves production logging hygiene while preserving operational behavior.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
