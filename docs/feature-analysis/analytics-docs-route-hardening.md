# Analytics Docs Route Hardening

## Summary
Hardened `GET/POST /api/analytics/docs` to align with enterprise mutation/read controls and standardized error handling.

## Changes
- Switched endpoint auth/permission failures to centralized `ApiErrors` handling.
- Replaced ad-hoc JSON error responses with unified `errorResponse` envelopes.
- Added audit logging for doc view tracking mutations (`TRACK_DOC_VIEW`) with non-blocking persistence behavior.
- Kept existing zod validation + rate limiting + team/file authorization checks.

## Security/Reliability Impact
- Reduces inconsistent response behavior across failure paths.
- Improves observability for analytics-write actions via audit trail.
- Preserves non-blocking ingestion reliability when audit persistence is degraded.

## Estimated business impact
- Acquisition: low
- Activation: low-medium (more reliable analytics visibility)
- Paid conversion: low (indirect through trust/operational reliability)
- Retention: medium (improved platform reliability + compliance posture)
