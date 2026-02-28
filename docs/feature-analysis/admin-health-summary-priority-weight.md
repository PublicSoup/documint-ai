# Feature Impact: Admin Health Summary Priority Weight

## Summary
Added a numeric priority weight to admin health summary diagnostics so incident responders can sort and queue alerts deterministically.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `summaryCodePriority` derived from `healthSummaryCode`.
  - Higher values represent higher urgency (`CRITICAL_DB` > `CRITICAL_AUDIT` > degraded classes > `OK`).

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium-High (faster and more consistent operational triage)

## Risk Notes
- Additive diagnostics-only field.
- No changes to auth, mutation, or runtime health-check behavior.
