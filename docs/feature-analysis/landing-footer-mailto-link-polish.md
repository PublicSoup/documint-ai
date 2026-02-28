# Landing Footer Mailto Link Polish

## Summary
Polished footer contact UX by replacing Next.js `Link` usage for `mailto:` with a native anchor element.

## Change
- Updated landing footer support email from:
  - `<Link href="mailto:...">`
- To:
  - `<a href="mailto:...">`

## Why this matters
- `mailto:` is a non-route navigation and should use native anchor semantics.
- Improves accessibility/tooling compatibility and avoids client-router misuse.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: low
