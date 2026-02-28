# Feature Impact: Checkout Context Payload Hardening

## Summary
Hardened checkout context parsing to fail safely on invalid/oversized JSON payloads instead of silently swallowing malformed request bodies.

## Technical Changes
- `src/app/api/checkout/route.ts`
  - Added content-type gate: parses context only for `application/json` payloads.
  - Added empty-body fast-path to preserve backward compatibility.
  - Added max payload size guard (`MAX_CHECKOUT_CONTEXT_BYTES`).
  - Added explicit JSON parse error handling (`Invalid checkout context JSON payload`).
  - Added zod validation error passthrough for structured client feedback.

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium
- Paid conversion: Medium (fewer hidden context failures in checkout flow)
- Retention: Medium (more predictable billing API behavior and diagnostics)

## Risk Notes
- Backward compatible for clients posting no body.
- Invalid/malformed bodies now fail fast instead of being silently ignored.
- No Stripe pricing or session semantics changed.
