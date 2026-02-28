# Marketing Event href Parser Hardening

## Summary
Strengthened `href` validation in `/api/analytics/marketing-event` to use parser-backed URL checks for absolute URLs and strict no-whitespace relative-path constraints.

## Implemented
- For relative paths, require `^/[^\s]*$`.
- For absolute URLs, parse with `new URL(...)` and allow only:
  - `http:`
  - `https:`
- Reject malformed URLs and any value containing whitespace.

## Expected Impact
- **Acquisition:** cleaner attribution inputs for landing conversion analytics.
- **Activation:** fewer malformed tracking payloads entering telemetry pipeline.
- **Paid conversion:** improved reliability of CTA-to-signup funnel analysis.
- **Retention:** indirect quality gain from better analytics integrity.

## Risk
- Low risk; existing tracked links already conform.
- Verify/commit remains blocked while exec backend is unavailable.
