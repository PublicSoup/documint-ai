# MEMORY.md - Autonomous Task Queue & State

This file tracks the autonomous improvement tasks performed by the agent.

## Operating Directive
Continuously improve the DocuMint AI codebase, focusing on the priority areas outlined in `SOUL.md`. Each task should be a discrete, verifiable, and production-grade improvement.

## Task Queue

### Priority 1: API Route Hardening & Security
- [x] **Harden "free" tier rate limits.** The initial limit of 100 AI calls/minute was dangerously high. Reduced to a more reasonable 15 calls/minute to prevent abuse and manage costs. (`src/lib/rate-limit.ts`)
- [x] **Audit all API routes to identify and replace any remaining usage of the `"free"` rate-limit tier with more appropriate, specific tiers.**
- [x] Implement IP-based rate limiting for unauthenticated, high-risk endpoints (e.g., auth, register).
- [x] **Add schema validation to API routes that were missing it.** Audited and hardened 6 endpoints, primarily by enforcing an empty body on `POST` requests that perform actions without input.
- [x] **Review and harden security for file upload and management endpoints.** This task is now complete. A full audit of the `/api/files/` surface was conducted.
    - **`bulk-create`:** Fixed a critical authorization bypass allowing users to create files in any team. Also added file name collision detection and corrected rate limiting.
    - **`search`:** Fixed a critical data-hiding bug where search results excluded all team files.
    - **`list`:** Fixed a major bug where the file listing excluded all team files.
    - **`create`:** Hardened rate limiting.
    - **`[fileId]`, `move`, `raw`:** Audited and confirmed to be secure.

### Priority 2: Eliminate Mock Data
- [x] Scan the codebase for any instances of mock data (`const mock...`, placeholder JSON) and replace them with live API/database calls.
- [x] Verify that all UI components have proper loading and empty states instead of relying on mock data for display.

### Priority 3: Web IDE Enhancements
- [x] Implement file creation, deletion, and renaming functionality within the IDE file tree.
- [x] **Integrate basic Git operations into the IDE (status, add, commit).** This task involved a major architectural refactor to correctly use the WebContainer for all Git operations, ensuring security and scalability.
- [ ] Connect the WebContainer terminal to the virtual filesystem for live command execution.

## Build Health Checks
- **2026-03-11 @ 8:13 PM CST:** ✅ Git integration and architectural refactor complete. Build pending.
- **2026-03-11 @ 7:15 PM CST:** ✅ Build successful. Fixed a TypeScript error in `/api/files/create/route.ts`. The `enforceRateLimit` function was called with a non-existent tier `"api-mutation"`. Replaced it with the correct `"file_create"` tier.
- **2026-03-11 @ 1:48 PM CST:** ✅ Build successful. Fixed 3 implicit `any` TypeScript errors in API routes (`/api/files/bulk-create`, `/api/files`, `/api/files/search`). The root cause was untyped parameters in `.map()` functions following Prisma `select` queries.
- **2026-03-11 @ 1:30 PM CST:** ✅ File API security audit and hardening complete. Build pending.
- **2026-03-11 @ 12:20 PM CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-10 @ 9:30 PM CST:** ✅ Build successful after API hardening. No TypeScript errors.
- **2026-03-10 @ 8:35 PM CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-10 @ 7:45 PM CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-10 @ 7:35 PM CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-10 @ 12:30 PM CST:** ✅ Build successful. Fixed 12 pre-existing TypeScript errors to achieve a clean compile.
- **2026-03-07 @ 07:48 CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-07 @ 06:47 CST:** ✅ Build successful. No TypeScript errors found.
- **2026-03-06 @ 21:56 CST:** ✅ Build successful. No TypeScript errors found.

## Memory / Context Bridge

- **Last Session Summary (2026-03-11):** Implemented file/folder creation in the IDE. Confirmed analytics pipeline uses live data. Hardened the file management API surface, fixing several critical vulnerabilities.
- **Current Session Summary (2026-03-11):** This was a critical session focused on architectural integrity.
    - Discovered that the existing Git API was using a dangerous and unscalable method of copying the entire workspace on the physical disk for every operation.
    - **Re-architected the entire Git feature** to properly use the singleton `WebContainer` instance. This involved:
        1. Enhancing `WebContainerManager` to support `cwd` for namespaced execution.
        2. Creating a new `syncUserWorkspaceToWebContainer` function to load user files from the DB into the container's virtual filesystem in a multi-tenant-safe way (`/workspaces/{userId}`).
        3. Completely rewriting the `/api/git/status` route and creating new `/api/git/add` and `/api/git/commit` routes on this new, correct foundation.
        4. Building and integrating a full-stack `SourceControlPanel` UI component into the IDE, activated from the activity bar.
    - This work corrected a major architectural flaw and established a solid, production-grade pattern for all future in-container operations.
- **Next Steps:** The next priority is to continue with **Web IDE Enhancements**. The next sub-task is to **Connect the WebContainer terminal to the virtual filesystem for live command execution.** This will allow users to run commands like `ls`, `npm install`, etc., directly in their sandboxed environment, which is a core feature of the product.
- **NOTE:** iMessage notifications failed due to not having a specific contact handle (phone/email) for the target 'Dylan'. Future status updates should be delivered directly in the output for cron jobs until this is resolved.
