# 2026-02-28 — Edge Proxy Security + Runtime Reliability Optimization

## Scope
Optimized `src/proxy.ts` to improve enterprise security posture and browser runtime stability while reducing unnecessary middleware overhead.

## Changes
- Added browser isolation/runtime headers at the edge:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Origin-Agent-Cluster: ?1`
- Updated matcher to skip `/api` routes so API handlers own latency-sensitive concerns without edge-middleware tax.
- Replaced unauthorized admin `console.warn` branch with deterministic redirect response header signal (`x-documint-security-event`) to reduce server-side console noise.

## Enterprise Impact Estimate
- **Acquisition:** Medium (stronger security posture for evaluation checklists).
- **Activation:** Medium (fewer runtime isolation issues in IDE/WebContainer sessions).
- **Paid conversion:** Medium-High (enterprise buyers value hardened edge controls).
- **Retention:** High (improves operational stability and reduces edge/runtime regressions).

## Verification
- `npm run build` attempted.
- Build currently blocked by pre-existing Next.js conflict requiring removal of legacy `src/middleware.ts` (proxy migration conflict).

## Risk Notes
- COEP/COOP/CORP can block non-compliant third-party assets; current CSP/resource policy should be monitored in preview.
- Redirect event header is additive and should not affect existing client flows.
