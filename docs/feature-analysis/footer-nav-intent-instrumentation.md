# Footer Nav Intent Instrumentation

## Summary
Instrumented footer navigation links on the landing page to capture late-stage exploration intent.

## Implemented
- Replaced footer untracked links with `TrackedLink` for:
  - `Features` (`location: footer_nav_features`)
  - `Pricing` (`location: footer_nav_pricing`)
  - `Documentation` (`location: footer_nav_docs`)
- Reused existing event stream (`landing_secondary_cta_click`) and variant tagging.

## Expected Impact
- **Acquisition:** better understanding of deeper-scroll intent behavior.
- **Activation:** reveals whether users seek docs/pricing context before signup.
- **Paid conversion:** improves attribution of pricing discovery paths from footer actions.
- **Retention:** indirect; improves messaging + navigation decisions from measured behavior.

## Risk
- Low risk (instrumentation-only change).
- Verify/commit remains blocked until exec backend is restored.
