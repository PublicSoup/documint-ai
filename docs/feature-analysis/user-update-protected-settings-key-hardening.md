# User Update Protected Settings Key Hardening

## Summary
Hardened `PATCH /api/user/update` by expanding blocked settings keys to prevent tampering with API key metadata through a generic profile update path.

## Change
Expanded `DISALLOWED_SETTINGS_KEYS` from only:
- `apiKey`

to include:
- `apiKey`
- `apiKeyLabel`
- `apiKeyCreatedAt`

## Why this matters
- Prevents metadata spoofing on API key labels/timestamps.
- Preserves separation between generic profile updates and dedicated API key rotation endpoints.
- Improves integrity of credential-related account state.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect trust)
- Retention: medium (security confidence)
