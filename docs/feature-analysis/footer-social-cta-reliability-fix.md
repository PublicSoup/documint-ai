# Footer Social CTA Reliability Fix

## Summary
Replaced non-functional footer social icon buttons on the landing page with actionable links and analytics instrumentation.

## Shipped
- GitHub icon now links to `https://github.com/documintai` in a new tab.
- Globe icon now links to `/docs`.
- Both actions emit `landing_secondary_cta_click` events with dedicated locations.

## Impact
- Removes dead-click UX in footer.
- Improves trust and discoverability for docs/community paths.
- Adds attribution coverage for footer social intent.
