# Analytics Session ID Sanitization Hardening

## Summary
Hardened `POST /api/analytics/docs` session identifier handling by enforcing a strict allowlist format for `x-session-id`.

## Change
- Added strict session-id regex validation:
  - allowed chars: `A-Z a-z 0-9 : _ -`
  - length: `8..255`
- Invalid or malformed session IDs now fall back to the existing IP-based session fallback.

## Security/Reliability Impact
- Reduces risk of malformed header values polluting analytics/session dimensions.
- Prevents control/unsafe characters from entering persisted session identifiers.
- Preserves ingestion reliability through safe fallback behavior.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: medium (analytics data quality + operational trust)
