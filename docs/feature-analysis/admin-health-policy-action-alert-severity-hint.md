# Feature Impact: Admin Health Policy Action Alert Severity Hint

## Summary
Added `policyMismatchActionAlertSeverityHint` to provide direct pager policy mapping (`none|watch|page`) for remediation-plan drift alerts.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchActionAlertSeverityHint`.
  - Current mapping:
    - `none` when action-drift alert is not recommended
    - `watch` when recommended but below high score threshold
    - `page` when action volatility score is high (`>= 85`)
  - Added `schemaCapabilities.policyMismatchActionAlertSeverityHint` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster and clearer remediation-plan alert escalation routing)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters reset on cold starts/redeploys.
