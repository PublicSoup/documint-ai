# Feature Impact: Admin Health Diagnostic Freshness Seconds

## Summary
Added explicit diagnostic freshness metadata to admin health responses so monitoring pipelines can detect stale payload handling or transport lag.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `diagnosticDataFreshnessSec`.
  - Added `schemaCapabilities.diagnosticDataFreshnessSec` flag.
  - Freshness is computed from payload generation epoch and current evaluation time.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (improved observability trust and stale-data detection)

## Risk Notes
- Additive diagnostics-only field.
- No behavior change to auth, checks, or routing logic.
