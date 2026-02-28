# Feature Impact: WebContainer Recovery Health Snapshot

## Summary
Added lightweight runtime health telemetry to WebContainer manager so the IDE can inspect recovery behavior and tracked process state during degraded sessions.

## Technical Changes
- `src/lib/web-container.ts`
  - Added `runtimeHealth` counters:
    - `recoveryCount`
    - `lastRecoveryAt`
    - `lastRecoveryReason`
  - Added `recordRecovery` hook in recovery path.
  - Added `getHealthSnapshot()` API exposing:
    - tracked process count
    - recovery counters + last reason/time

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium
- Paid conversion: Low-Medium
- Retention: High (faster diagnosis and confidence in IDE runtime reliability)

## Risk Notes
- In-memory telemetry only; no schema/API changes.
- No user-facing behavior change besides better diagnostics potential.
