# CLAW One-Shot Run Prompt — Enterprise Batch

Use this when you want one complete, high-quality implementation batch with verification and commit.

```txt
Run exactly one autonomous enterprise batch on DocuMint AI.

Scope for this one shot:
1) Audit highest-risk/highest-impact area
2) Implement one deploy-ready feature or hardening improvement
3) Run verification (`npm run build`, plus lint/tests if available)
4) Fix regressions introduced by this batch
5) Commit a single atomic change

Quality requirements:
- strict TypeScript (no new any)
- no placeholder/stub behavior
- auth + authz + zod + rate-limit + error envelope + audit log for API mutations
- no bare console logs in API/server paths
- backward-compatible UX

Output format:
- changed files
- verification commands and results
- risk notes
- business impact estimate (acquisition, activation, paid conversion, retention)
- next one-shot recommendation
```
