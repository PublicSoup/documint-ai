# Site Footer Server-Component Polish

## Summary
Converted `SiteFooter` from a client component to a server component by removing unnecessary client-only directives/imports.

## Change
- Removed `'use client'` pragma.
- Removed unused `React` import.

## Why this matters
- Reduces client bundle overhead for a static/footer-heavy UI surface.
- Preserves existing behavior (all interactive tracking links remain functional via nested client `TrackedLink` components).
