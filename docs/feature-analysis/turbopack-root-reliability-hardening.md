# Turbopack Root Reliability Hardening

## Summary
Set `turbopack.root` in `next.config.ts` to the repository root (`__dirname`) to remove ambiguous workspace-root inference during production builds.

## Problem
Builds were warning about multiple lockfiles and auto-selecting an external root directory. This introduces non-determinism risk in build behavior and noisy CI/local output.

## Change
- Updated `next.config.ts`:
  - `turbopack.root = __dirname`

## Reliability Impact
- Ensures deterministic project root resolution.
- Reduces chance of incorrect cache/layout assumptions in local and CI builds.
- Removes repeated warning noise that can obscure real build issues.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: medium (more stable delivery pipeline)
