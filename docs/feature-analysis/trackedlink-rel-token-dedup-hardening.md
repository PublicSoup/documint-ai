# TrackedLink rel Token Dedup Hardening

## Summary
Improved `_blank` link hardening in `TrackedLink` by deduplicating `rel` tokens while enforcing security attributes.

## Implemented
- Replaced string concatenation logic with token-set normalization.
- For `target="_blank"`, always ensures:
  - `noopener`
  - `noreferrer`
- Prevents duplicate rel tokens when caller already provides them.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct effect; improves UI primitive robustness.
- **Retention:** indirect trust/security quality improvement.

## Risk
- Very low risk; deterministic rel normalization only.
- Verify/commit remains blocked while exec backend is unavailable.
