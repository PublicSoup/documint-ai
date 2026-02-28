# Feature Impact: Admin Health Contract Compatibility Mode

## Summary
Added `contractCompatibilityMode` to admin health diagnostics so integrations can apply strict/lenient parsing policy based on explicit server guidance.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `contractCompatibilityMode` (currently `strict`).
  - Added `schemaCapabilities.contractCompatibilityMode` flag.
  - Complements existing `contractRevision` + `responseSchemaHash` metadata.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (safer monitor parser behavior and reduced contract drift incidents)

## Risk Notes
- Additive metadata-only field.
- No behavior changes in auth/health checks/mutation logic.
