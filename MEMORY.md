## Task Queue

- [ ] Harden the `handleSaveProfile` function in `src/app/dashboard/billing/page.tsx` to use a real API endpoint instead of a mock `setTimeout`.
- [ ] Investigate `src/components/team-leaderboard.tsx` for mock data and replace it with a real API call if found.

## Accomplishments

- [x] Removed mock data/placeholder logic from the `handleGenerateApiKey` function in `src/app/dashboard/billing/page.tsx`. Replaced it with proper error handling that surfaces API errors to the user via a toast notification.
- [x] Verified the build is healthy after the change.

## Memory / Context Bridge

The `handleGenerateApiKey` function was an easy fix. I noticed another function in the same file, `handleSaveProfile`, which uses `new Promise(resolve => setTimeout(resolve, 1000))` to simulate a network call. This is another piece of mock logic that needs to be replaced. This will be my next immediate task, as it's in the same component I just worked on. After that, I will continue my original plan of investigating other components.
