# User API Key User-Existence Hardening

## Summary
Hardened `GET/POST /api/user/api-key` by enforcing explicit user existence checks and standardized unauthorized error flow.

## Changes
- Replaced inline unauthorized `return errorResponse(...)` with `throw ApiErrors.unauthorized()`.
- Added explicit `User` existence checks after session auth in both handlers.
- Return `ApiErrors.notFound("User")` when session user record is missing.

## Why this matters
- Prevents ambiguous behavior when a stale session references a deleted account.
- Keeps endpoint behavior aligned with hardened account routes.
- Improves reliability and client-side error interpretation.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: low-medium
