# Versions Diff Error Envelope Hardening

## Summary
Hardened `GET /api/versions/diff` with centralized query validation and standardized API error envelopes.

## Changes
- Added shared API utilities (`validateQuery`, `ApiErrors`, `errorResponse`).
- Replaced ad-hoc unauthorized/bad-request/not-found/forbidden responses.
- Tightened query constraints for version ids (`trim + max length`).
- Removed route-level console error logging.

## Why this matters
- Improves consistency of versioning API error semantics.
- Reduces client ambiguity around error response shapes.
- Strengthens reliability posture of documentation comparison workflows.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
