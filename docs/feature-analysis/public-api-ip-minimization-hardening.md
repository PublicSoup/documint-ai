# Public API IP Minimization Hardening

## Summary
Hardened `POST /api/v1/analyze` audit logging by masking client IP addresses before persistence.

## Changes
- Added `maskIpAddress(...)` helper to normalize IPv4/IPv6 into coarse forms.
- Applied masking in both:
  - API auth-failure audit events (`API_AUTH_FAILURE`)
  - Successful analyze audit events (`API_ANALYZE`)

## Why this matters
- Reduces sensitive network data retention in audit logs.
- Improves privacy posture while preserving operational utility for abuse/correlation analysis.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect trust)
- Retention: low-medium
