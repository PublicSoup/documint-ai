# Feature Impact: Admin Health Runbook URL Mapping

## Summary
Added deterministic runbook URL mapping to admin health diagnostics so operators can jump directly from failure detection to remediation playbooks.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added runbook mapping by degraded component.
  - Added top-level `runbookUrls` array to response.
  - De-duplicates mapped URLs for cleaner payload consumption.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster operational response reduces prolonged degradation impact)

## Risk Notes
- Additive diagnostics-only change.
- Current URLs use internal docs path conventions and can be refined as runbooks are finalized.
