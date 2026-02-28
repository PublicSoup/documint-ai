# Feature Impact: Admin Health Escalation Signal CSV

## Summary
Added `escalationSignalNamesCsv` to admin health diagnostics for legacy dispatch systems that need a compact, parse-light breakdown of active escalation triggers.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added deterministic `escalationSignalNames` derivation from active escalation signals.
  - Added top-level `escalationSignalNamesCsv`.
  - Added `schemaCapabilities.escalationSignalNamesCsv` flag.
  - Updated `escalationSignalCount` to reuse sorted signal-name list.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster compatibility with legacy alert pipelines and triage tools)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
