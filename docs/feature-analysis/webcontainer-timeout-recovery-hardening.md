# Feature Impact: WebContainer Timeout + Recovery Hardening

## Summary
Improved IDE runtime reliability by adding timeout-guarded WebContainer operations with automatic one-shot recovery for stale/closed/timeout failure modes.

## Technical Changes
- `src/lib/web-container.ts`
  - Added operation timeout wrapper (`withTimeout`) for WebContainer interactions.
  - Added `runWithRecovery` helper:
    - timeout + recoverable error detection
    - automatic `reset()` and single retry for recoverable failures
  - Applied recovery wrapper to:
    - `mountFiles`
    - `writeFile`
    - `readFile`
    - `spawn`

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium-High (fewer IDE startup/runtime dead states)
- Paid conversion: Medium (better reliability in core paid feature: web IDE)
- Retention: High (reduced runtime flakiness in daily workflows)

## Risk Notes
- Recovery is bounded to one retry to avoid infinite loops.
- Existing API surface remains unchanged.
- Timeouts may surface latent long-running operations, but with clearer errors and reset path.
