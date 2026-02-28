# Feature Impact: Admin Health Ops Escalation Required

## Summary
Added a top-level `opsEscalationRequired` boolean to admin health diagnostics for immediate pager gating without custom threshold logic.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `opsEscalationRequired` derived from high-urgency conditions:
    - `severity === critical`
    - `criticalComponentCount > 0`
    - `summaryCodePriority >= 90`
  - Added `schemaCapabilities.opsEscalationRequired` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster escalation decisions and reduced incident response latency)

## Risk Notes
- Additive diagnostics-only field.
- No behavior changes to auth, health checks, or mutation paths.
