# Feature Impact: Admin Health Escalation Signal Count

## Summary
Added `escalationSignalCount` to admin health diagnostics to quantify how many independent escalation triggers are active.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `escalationSignals` map for escalation trigger sources.
  - Added top-level `escalationSignalCount` from active signal count.
  - Added `schemaCapabilities.escalationSignalCount` flag.
  - Refactored escalation-required/reason logic to use shared signal map.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (clearer escalation confidence and triage prioritization)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
