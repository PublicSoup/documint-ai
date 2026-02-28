# 2026-02-28 — Admin Role Mutation Guardrails

## Scope
Hardened `PATCH /api/admin/users` role mutation flow to prevent privilege safety regressions and accidental admin lockout.

## Changes
- Requires authenticated admin actor id before mutation processing.
- Blocks self-role changes for the acting admin user.
- Adds target-user existence check with explicit `notFound` behavior.
- Returns deterministic `unchanged` payload when requested role equals current role.
- Prevents demotion of the last remaining `ADMIN` account.
- Expands audit payload with `previousRole` and `newRole` to improve forensic traceability.

## Enterprise Impact Estimate
- **Acquisition:** Low direct impact; improves trust posture for enterprise evaluations.
- **Activation:** Medium indirect impact; reduces admin misconfiguration incidents during onboarding.
- **Paid conversion:** Medium; strengthens security controls expected by security-conscious buyers.
- **Retention:** High; prevents catastrophic admin lockout and improves operational stability.

## Risk Notes
- Existing clients should tolerate unchanged response shape; added `unchanged` is additive.
- Last-admin protection relies on canonical `User.role` values and consistent admin assignment policy.
