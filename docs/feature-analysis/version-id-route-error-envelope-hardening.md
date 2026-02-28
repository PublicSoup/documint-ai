# Version ID Route Error Envelope Hardening

## Summary
Hardened `GET/POST /api/versions/[id]` by replacing ad-hoc parameter/auth/error handling with centralized API error utilities.

## Changes
- Added `ApiErrors` + `errorResponse` usage for unauthorized/not-found/forbidden/bad-request paths.
- Added shared version-id parser helper with strict id normalization (`trim`, max length).
- Removed route-level `console.error` catch behavior.
- Preserved rollback transaction semantics and audit logging.

## Why this matters
- Keeps version endpoint behavior consistent with enterprise API contracts.
- Reduces route-specific error-shape drift and improves client reliability.
- Strengthens security posture via stricter id validation.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
