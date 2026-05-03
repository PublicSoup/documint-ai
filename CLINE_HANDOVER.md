# DocuMint AI - Project State & Agent Handover Document

**Target Audience:** Cline (or any subsequent AI agent)
**Project Context:** Next.js 16, Prisma ORM, WebContainer IDE, AI-assisted code generation

This document contains a comprehensive summary of the recent audits, architectural decisions, and implemented features executed by the previous agent (Antigravity). Use this as your context baseline before making further modifications to the codebase.

---å

## 1. Executive Summary of the Codebase
DocuMint AI is an ambitious, full-fledged browser-based IDE using WebContainers. It features AI code generation, Stripe billing, and team collaboration. 

**Recent Audit Findings:**
- The codebase experienced rapid feature accumulation resulting in scattered state management (especially around the IDE runtime).
- Found several "god-components" and scattered `any` types.
- The core loop (AI Chat -> WebContainer Execution -> Live Preview) suffered from "runtime optimism" (UI assuming the WebContainer/Terminal was ready before it actually was).

## 2. Priority-Ranked Execution Roadmap (Established)
We established the following roadmap to stabilize the platform and improve the beginner UX:
1. **P0 - Foundation:** Stabilize workspace state, IDE types, and the Agent Engine.
2. **P1 - AI Gateway Integration:** Unified API model routing (Completed).
3. **P2 - Runtime + Preview Coherence:** Fix WebContainer race conditions and terminal state disconnects (In Progress).
4. **P3 - Beginner UX:** 1-click scaffolding, better error recovery.
5. **P4 - Polish:** Final UX improvements.

---

## 3. Work Completed

### Phase 1: Vercel AI Gateway & Multi-Model Integration
*   **Goal:** Move away from hardcoded Google Gemini and support multiple models via Vercel AI Gateway.
*   **Implementation:**
    *   Updated `env.ts` and `.env` with `AI_GATEWAY_API_KEY` (using a managed `vck_` key).
    *   Refactored `src/lib/ai.ts` to use `@ai-sdk/gateway` as the primary router.
    *   Created `AVAILABLE_MODELS` registry (Gemini 2.5 Pro, Claude 3.5 Sonnet, GPT-4o, DeepSeek R1, Grok 2).
    *   Added a persistent Model Selector Dropdown in `src/components/ide/ai-chat-panel.tsx` (saves to `localStorage`).
    *   Threaded the `model` parameter through the `/api/chat/route.ts` API into the `src/lib/agent/engine.ts` (`runAgent`).

### Phase 2: Runtime + Preview Coherence (Currently In Progress)
*   **Goal:** Make `useExecutionEngine` the absolute source of truth for the WebContainer lifecycle (booting, installing, starting, ready, error) and fix terminal disconnects.
*   **The Bug ("Runtime Optimism"):** Clicking "Run Project" triggered a React state change that mounted the terminal but simultaneously attempted to write to `terminalInstance` (which was `null` in the stale closure).
*   **Implementation (Done so far):**
    *   Refactored `src/hooks/use-execution-engine.ts`: Replaced stale closure dependencies with `useRef` for `termRef` and `bootedRef`. Added async polling (`await new Promise`) to safely wait for the terminal to mount and the WebContainer to boot before piping commands like `npm install`.
*   **Pending Work for Cline to Finish:**
    *   Update `src/components/ide/webcontainer-terminal.tsx` to accept a new prop: `onTerminalReady?: (term: XTerm) => void` and call it when the terminal mounts.
    *   Update `src/components/ide/terminal-panel.tsx` to pass `setTerminalInstance` into `onTerminalReady` instead of doing it hackily on `onProcessStart`.
    *   Pass `runStatus` down from `EnhancedIDELayout` -> `TerminalPanel` -> `WebContainerTerminal` so the terminal UI accurately displays "Installing", "Starting Server", etc.

---

## 4. Key Files & Architecture Notes

### IDE State Management
- `src/components/ide/enhanced-ide-layout.tsx`: The God-component wiring everything together. It holds `files`, `activeFileId`, `terminalInstance`, and manages layouts.
- `src/hooks/use-execution-engine.ts`: Owns the WebContainer lifecycle. Returns `runStatus`, `run()`, `mountAll()`.
- `src/hooks/use-ide-file-manager.ts`: Manages virtual file states, dirty flags, and content updates.

### AI & Agent Engine
- `src/lib/agent/engine.ts`: The main recursive Agent loop. It parses the system prompts, calls the AI provider, and yields diffs or commands.
- `src/lib/ai.ts`: The provider initialization layer. Uses standard Vercel AI SDK patterns.

### WebContainer Runtime
- `src/lib/web-container.ts`: Singleton wrapper around the `@webcontainer/api`. Includes health tracking, timeout fallbacks, and recovery counts.

---

## 5. Directives for Cline

1. **Finish Batch 2:** Complete the Terminal wiring mentioned above (`webcontainer-terminal.tsx` -> `terminal-panel.tsx`). Ensure the `XTerm` instance is successfully passed back up to the execution engine.
2. **Follow the User's Rules:** The user operates under strict adversarial engineering protocols ("ARCHITECT PRIME"). 
    * Never skip recon. 
    * Write pure functions. 
    * Catch and document all errors.
    * Use specific tools (e.g. `grep_search` over shell piping).
3. **No Phantom State:** Rely on the `runStatus` enum (`idle | installing | starting | ready | error`) for all UI updates regarding the project preview.

Good luck!
