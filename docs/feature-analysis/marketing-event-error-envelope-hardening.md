# Marketing Event Error Envelope Hardening

## Summary
Standardized invalid-payload handling in `/api/analytics/marketing-event` to use the shared API error envelope.

## Implemented
- Updated route to return:
  - `errorResponse(ApiErrors.badRequest(...))`
  - includes flattened Zod validation details for diagnostics
- Replaced ad-hoc `NextResponse.json({ error: ... }, { status: 400 })` branch.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** clearer client-side handling due to consistent error envelope.
- **Paid conversion:** indirect reliability gain in conversion event pipeline.
- **Retention:** improved API consistency and operability.

## Risk
- Very low risk; error-shape normalization only.
- Verify/commit remains blocked while exec backend is unavailable.
