# Feature Impact: Admin Health Payload Compression Hint

## Summary
Added `healthPayloadCompressionHint` to admin health diagnostics to guide downstream consumers on expected payload verbosity strategy.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthPayloadCompressionHint` (current value: `full`).
  - Added `schemaCapabilities.healthPayloadCompressionHint` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (clearer monitor expectations and parse/storage strategy alignment)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
