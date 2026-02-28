# Feature Impact: Admin Health WebContainer Process Pressure Threshold

## Summary
Extended admin health reliability diagnostics to flag degraded status when tracked WebContainer process count exceeds a pressure threshold.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `WEB_CONTAINER_TRACKED_PROCESS_DEGRADED_THRESHOLD`.
  - Computes `trackedProcessDegraded` from runtime health snapshot.
  - Sets overall admin health to degraded when process pressure threshold is exceeded.
  - Emits `webContainerTrackedProcessPressure` in `checkFailures`.
  - Adds `trackedProcessDegradedThreshold` to webContainer diagnostics payload.

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium
- Paid conversion: Low-Medium
- Retention: High (faster detection of IDE process leaks/stale runner pressure)

## Risk Notes
- Read-only diagnostics only.
- Threshold is configurable in code and can be tuned with production telemetry.
