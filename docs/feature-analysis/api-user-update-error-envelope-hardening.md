# API User Update Error-Envelope Hardening

## Summary
Hardened `PATCH /api/user/update` to enforce standardized API error envelopes and remove bare server logging.

## Implemented
- Added centralized error handling imports (`ApiErrors`, `errorResponse`).
- Moved auth check into guarded `try` flow and standardized unauthorized handling.
- Added explicit invalid-JSON parsing guard.
- Replaced ad-hoc error responses with `ApiErrors` throws for:
  - invalid payload
  - OAuth password-change restriction
  - missing current password
  - incorrect current password
  - empty update payload
- Removed bare `console.error` from catch path; now returns `errorResponse(error)`.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** more consistent client-visible API errors in profile settings flows.
- **Paid conversion:** indirect trust gain from enterprise-grade API consistency.
- **Retention:** improved reliability and debuggability in account-management paths.

## Risk
- Low risk; behavior-equivalent validation/auth checks with normalized error handling.
- Verify/commit remains blocked while exec backend is unavailable.
