# Feature Impact: Admin Health Incident Routing Hint

## Summary
Added deterministic `incidentRoutingHint` metadata so automated responders can dispatch admin-health incidents to the correct on-call domain immediately.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `incidentRoutingHint` derived from `incidentClass`.
  - Added `schemaCapabilities.incidentRoutingHint` flag.
  - Current routing hints:
    - `platform-database-oncall`
    - `security-integrity-oncall`
    - `ide-runtime-oncall`
    - `platform-infra-oncall`
    - `platform-operations`
    - `none`

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (reduced MTTR via direct responder routing)

## Risk Notes
- Additive diagnostics-only field.
- No auth, mutation, or runtime logic behavior changes.
