# Analytics DocView Feature-Gate Parity

## Summary
Aligned `POST /api/analytics/docs` with `GET /api/analytics/docs` by enforcing the same analytics feature gate before ingestion.

## Change
- Added `requireFeature("analytics")` guard at the start of the POST handler.
- If the feature is unavailable for the tenant/user plan, the route now exits consistently with the gate response.

## Why this matters
- Prevents unauthorized analytics-write usage when analytics is not enabled.
- Keeps read/write behavior consistent for plan-gated features.
- Reduces downstream data inconsistency from unentitled ingestion.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: medium (clear feature boundary supports upgrade path)
- Retention: low-medium (predictable entitlement behavior)
