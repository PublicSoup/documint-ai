# Feature Impact: Trial-Intent Billing Plan Focus

## Summary
Improved trial-to-paid progression in billing by making trial intent and selected plan context visible and actionable on `/dashboard/billing`.

## Technical Changes
- Reads `intent` and `plan` query params client-side on billing load.
- If `intent=trial`, auto-focuses Plans tab and displays trial activation guidance banner.
- If `plan` is one of `starter|pro|team`, highlights the matching plan card and upgrades CTA copy to `Continue with <Plan>`.
- Keeps all existing checkout behavior unchanged (`/api/checkout` flow retained).

## Business Impact Estimate
- Acquisition: **Low** — affects post-auth billing stage, not first click acquisition.
- Activation: **Medium** — trial users get stronger context continuity in first billing session.
- Paid conversion: **High** — reduced decision friction by spotlighting intended plan and explicit continuation CTA.
- Retention: **Medium** — clearer early value path helps users complete setup and reduces first-session abandonment.

## Risk Notes
- Query values are allowlisted before use.
- No billing backend or Stripe logic changed.
- UI-only enhancement with backward-compatible defaults.
