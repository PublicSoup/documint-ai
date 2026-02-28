# Feature Impact: Admin Health Critical Component Count

## Summary
Added a compact `criticalComponentCount` metric so responders can quickly distinguish hard-outage conditions from degraded-but-operational states.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `criticalComponentCount`.
  - Current count includes critical domains:
    - database offline
    - audit trail integrity compromised
  - Added `schemaCapabilities.criticalComponentCount` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster outage severity triage and escalation)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
