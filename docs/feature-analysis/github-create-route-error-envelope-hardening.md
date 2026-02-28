# GitHub Create Route Error Envelope Hardening

## Summary
Hardened `POST /api/github/create` with standardized auth/error handling and safer upstream failure mapping.

## Changes
- Replaced inline unauthorized response with `throw ApiErrors.unauthorized()`.
- Reduced credential exposure surface by selecting only `accessToken` from DB.
- Replaced decrypt-path console logging with thrown internal error.
- Standardized upstream GitHub failures:
  - `401` -> unauthorized token error
  - `422` -> conflict (repository name unavailable/invalid)
  - others -> service unavailable
- Preserved audit logging and success payload contract.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
