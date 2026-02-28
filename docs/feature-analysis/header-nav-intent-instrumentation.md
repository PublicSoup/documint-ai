# Header Nav Intent Instrumentation

## Summary
Instrumented top-nav section links on the landing page to capture early-stage buyer intent before CTA clicks.

## Implemented
- Replaced untracked header nav anchor links with `TrackedLink` for:
  - `Features` (`location: header_nav_features`)
  - `Solutions` (`location: header_nav_solutions`)
  - `Pricing` (`location: header_nav_pricing`)
- Reused existing `landing_secondary_cta_click` event stream and `LANDING_EXPERIMENT_VARIANT` tagging.

## Expected Impact
- **Acquisition:** clearer understanding of what visitors seek first.
- **Activation:** correlates information-seeking behavior with signup outcomes.
- **Paid conversion:** stronger attribution between pricing-section interest and eventual plan selection.
- **Retention:** indirect; improves messaging alignment for right-fit users.

## Risk
- Low risk instrumentation-only change.
- Verify/commit remains blocked until exec backend is restored.
