# A/B Test Rollout Checklist (Conversion)

## Objective
Ship conversion experiments safely once runtime execution is restored.

## Pre-Launch
- Confirm build/lint pass on main branch.
- Confirm event schema includes `eventName`, `location`, optional `variant`.
- Confirm dashboard CTA panel displays baseline click counts.

## Experiment Setup
- Define one primary metric per test (CTR or signup-start rate).
- Keep one variable changed per test variant.
- Assign deterministic variant labels (`control`, `v1`, `v2`).

## Guardrails
- Keep event names stable across variants.
- Avoid PII in client event payloads.
- Preserve server allowlist + rate limiting.

## Launch
- Enable experiment to limited traffic first.
- Validate event ingestion for all variants.
- Watch for funnel anomalies before expanding traffic.

## Review
- Evaluate after statistically meaningful sample size.
- Promote winner; archive losing variant.
- Log outcomes in `docs/feature-analysis/` for continuity.
