# Feature Impact: Admin Health Critical Component CSV

## Summary
Added `criticalComponentNamesCsv` to admin health diagnostics for legacy alert consumers that cannot parse arrays.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `criticalComponents` derivation for outage-class domains.
  - Added top-level `criticalComponentNamesCsv` field.
  - Added `schemaCapabilities.criticalComponentNamesCsv` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (better compatibility with legacy incident tooling)

## Risk Notes
- Additive diagnostics-only field.
- No auth, mutation, or runtime behavior changes.
