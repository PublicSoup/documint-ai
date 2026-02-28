# Feature Impact: Admin Health WebContainer Recovery Threshold

## Summary
Enhanced admin health diagnostics by flagging WebContainer runtime as degraded when recovery churn crosses a threshold, improving early detection of IDE instability.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `WEB_CONTAINER_RECOVERY_DEGRADED_THRESHOLD` constant.
  - Marks health as degraded when WebContainer `recoveryCount` exceeds threshold.
  - Emits `webContainerRecoveryRate` in `checkFailures` for explicit triage signal.
  - Adds `recoveryDegradedThreshold` to webContainer diagnostic payload.

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium
- Paid conversion: Low-Medium
- Retention: High (proactive IDE instability detection improves reliability response)

## Risk Notes
- Read-only diagnostics change; no runtime mutation behavior changed.
- Threshold is conservative and can be tuned as operational data accumulates.
