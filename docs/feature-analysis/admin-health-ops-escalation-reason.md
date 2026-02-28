# Feature Impact: Admin Health Ops Escalation Reason

## Summary
Added a compact `opsEscalationReason` enum to explain why escalation is required, improving pager transparency and reducing triage ambiguity.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `opsEscalationReason` values:
    - `critical-severity`
    - `critical-component`
    - `priority-threshold`
    - `none`
  - Added `schemaCapabilities.opsEscalationReason` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster escalation context and clearer incident handoff)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
