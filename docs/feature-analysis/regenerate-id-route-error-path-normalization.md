# Regenerate-by-ID Route Error Path Normalization

## Summary
Hardened `POST /api/regenerate/[id]` by normalizing all error branches to throw centralized `ApiErrors` and resolve via shared `errorResponse(...)` in one place.

## Changes
- Replaced inline `return errorResponse(ApiErrors...)` branches with `throw ApiErrors...` for:
  - unauthorized
  - invalid params
  - permission denied
  - file/content not found
  - AI generation failure
- Added structured param-validation details on invalid file ID.

## Why this matters
- Ensures a single, consistent exception/error-envelope flow.
- Reduces branch-level response drift and improves maintainability.
- Strengthens reliability of failure handling for regeneration workflows.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
