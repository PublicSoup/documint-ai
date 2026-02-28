# Header + Contact CTA Instrumentation

## Summary
Extended landing conversion tracking to include high-visibility header actions and late-funnel Contact Sales intent.

## Implemented
- Replaced untracked header links with `TrackedLink` for:
  - `Log in` (`location: header_login`)
  - `Get Started` (`location: header_primary`)
- Added tracking for final-section `Contact Sales` CTA (`location: final_cta_contact_sales`).
- All new links use existing variant strategy (`LANDING_EXPERIMENT_VARIANT`).

## Expected Impact
- **Acquisition:** better attribution of top-nav entry behavior.
- **Activation:** improved visibility into auth-path intent split (login vs signup).
- **Paid conversion:** captures enterprise-leaning sales-contact intent near decision stage.
- **Retention:** indirect; improved funnel clarity supports better audience targeting.

## Risk
- Low risk; instrumentation-only wiring using existing tracking primitives.
- Verify/commit blocked until exec backend is restored.
