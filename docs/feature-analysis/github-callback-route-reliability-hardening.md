# GitHub Callback Route Reliability Hardening

## Summary
Hardened `GET /api/github/callback` for safer OAuth callback handling and cleaner production failure behavior.

## Changes
- Added stricter query validation (`trim` + length bounds for `code` and `state`).
- Switched to `req.nextUrl.searchParams` parsing path.
- Added `buildSettingsRedirect(...)` helper for consistent redirect outcomes.
- Removed console logging from callback failure paths.
- Added explicit upstream token-response status check before accepting access token.
- Preserved existing UX contract (redirect back to settings with `github_error`/`github_connected` markers).

## Why this matters
- Improves callback resilience and input hygiene on a security-sensitive OAuth endpoint.
- Reduces noisy production logs while preserving user-visible failure semantics.
- Standardizes redirect handling and reduces branch drift.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
