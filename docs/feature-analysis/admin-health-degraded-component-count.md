# Feature Impact: Admin Health Degraded Component Count

## Summary
Added a compact `degradedComponentCount` metric to admin health diagnostics for simple threshold alerts without array parsing.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `degradedComponentCount` derived from `degradedComponents.length`.
  - Updated internal degraded logic to use this metric consistently.
  - Added `schemaCapabilities.degradedComponentCount` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (simpler monitor integration and faster triage)

## Risk Notes
- Additive diagnostics-only field.
- No behavior changes to auth, mutation, or health check execution.
