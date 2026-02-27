# Marketing CTA Analytics Surface

## Summary
Added a dashboard-visible conversion readout for landing CTA tracking events.

## Implemented
- Extended analytics library with `getMarketingCtaAnalytics` to aggregate `MARKETING_EVENT` audit logs (30-day window).
- Added **Landing CTA Performance (Last 30 Days)** card in `/dashboard/analytics` showing:
  - total CTA clicks
  - top CTA locations/events by count

## Impact
- **Acquisition:** Immediate visibility into top-performing landing entry points.
- **Activation:** Highlights which CTA positions drive signup intent.
- **Paid conversion:** Enables pricing/hero CTA optimization with real usage signals.
- **Retention:** Better funnel tuning improves customer fit quality over time.

## Risk
- Data source is currently audit logs; high scale should migrate to dedicated analytics tables.
