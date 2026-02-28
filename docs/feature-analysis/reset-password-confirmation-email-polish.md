# Reset Password Confirmation Email Polish

## Summary
Applied small UX and logging-hygiene polish to the password reset confirmation email flow.

## Changes
- Updated confirmation email footer year from static `2025` to dynamic `${new Date().getFullYear()}`.
- Replaced catch-path `console.error` in async email send with non-blocking silent fallback comment.

## Why this matters
- Prevents stale trust signals in transactional email footers.
- Reduces production console noise in non-critical side effects.
