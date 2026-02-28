# Site Footer Import Hygiene Polish

## Summary
Removed an unused `next/link` import from `SiteFooter` after migration to `TrackedLink`-based navigation.

## Why this matters
- Reduces lint noise and keeps UI component code clean.
- Prevents maintenance drift after instrumentation refactors.
