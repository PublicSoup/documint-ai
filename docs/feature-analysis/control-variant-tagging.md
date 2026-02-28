# Control Variant Tagging for Landing CTAs

## Summary
Added explicit `variant="control"` tagging to currently tracked landing CTAs so A/B rollout can begin without backfilling historical semantics.

## Implemented
- Updated landing CTA tracking calls to include `variant="control"` for:
  - hero primary CTA
  - hero secondary CTA
  - pricing CTAs
  - sticky conversion bar CTAs
  - final CTA

## Expected Impact
- **Acquisition:** cleaner baseline comparison for headline/copy tests.
- **Activation:** faster analysis of signup-intent behavior by variant.
- **Paid conversion:** direct support for pricing CTA experiment attribution.
- **Retention:** indirect; better acquisition targeting from reliable experiment baselines.

## Risk
- Low risk (tracking metadata only).
- Verify/commit deferred until exec backend recovery.
