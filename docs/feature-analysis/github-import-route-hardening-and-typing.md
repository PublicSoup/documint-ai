# GitHub Import Route Hardening + Typing

## Summary
Hardened `POST /api/github/import` by normalizing error flow to centralized API exceptions and removing unsafe/noisy catch-path logging.

## Changes
- Replaced inline `errorResponse(ApiErrors...)` returns with thrown `ApiErrors` for:
  - unauthorized user
  - missing resolved user
  - missing GitHub connection
  - decrypt failure
  - forbidden team import scope
- Added typed GitHub content interface (`GitHubRepoContentItem`) and removed `any` from file filtering logic.
- Removed route-level `console.error`/`console.warn` in stream and per-file processing branches.
- Replaced `metadata: analysisResult as any` with `Prisma.InputJsonValue`-safe assignment.

## Why this matters
- Improves consistency and maintainability of a high-impact ingestion endpoint.
- Reduces logging noise/leak risk in credential and stream error paths.
- Strengthens typing guarantees in a critical batch import workflow.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
