# AI Architect Route Error Envelope Hardening

## Summary
Hardened `POST /api/ai/architect` by standardizing payload validation and error handling paths.

## Changes
- Added shared API utilities: `validateBody`, `ApiErrors`, `errorResponse`.
- Moved auth check into main try/catch and replaced ad-hoc unauthorized/forbidden/500 returns with thrown `ApiErrors`.
- Replaced manual payload `safeParse(await req.json())` with `validateBody(req, architectRequestSchema)`.
- Removed route-level console logging from context/persistence/fatal catch branches.
- Preserved non-blocking behavior for context building and metadata persistence side paths.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
