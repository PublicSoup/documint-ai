# Legal Pages Dynamic Year Polish

## Summary
Polished legal page UX by replacing stale hard-coded copyright years with dynamic year rendering.

## Changes
- Updated:
  - `src/app/legal/privacy/page.tsx`
  - `src/app/legal/terms/page.tsx`
- Replaced `© 2025` with `© {new Date().getFullYear()}`.

## Why this matters
- Prevents trust erosion from outdated legal page timestamps.
- Eliminates recurring manual year-maintenance tasks.
