# Marketing Event Constant Centralization

## Context
Marketing event definitions (`eventName`, `location`, `variant`, `sessionHint`) were duplicated between the `TrackedLink` component and the API route handler. This created a risk of drift where the frontend might send an event that the backend rejects due to a mismatch in allowlists.

## Changes
- Created `src/lib/marketing-events.ts` as the Single Source of Truth (SSOT).
- Exported constant arrays/tuples for event names, location tokens, and prefixes.
- Updated `src/components/marketing/tracked-link.tsx` to use the shared constants for session hint generation.
- Updated `src/app/api/analytics/marketing-event/route.ts` to use the shared constants for validation.

## Benefits
- **Reliability:** Frontend and backend now share the exact same definitions.
- **Maintainability:** Adding a new event location or name only requires editing one file.
- **Type Safety:** `MarketingEventName` type is now exported and reusable.

## Verification
- `npm run build` will confirm that the imports and types match.
- Runtime behavior remains identical, just backed by shared constants.
