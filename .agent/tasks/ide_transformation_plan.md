# Implementation Plan - DocuMint IDE Transformation

The goal is to evolve DocuMint from a documentation/analysis tool into a fully-functional Web IDE (Integrated Development Environment). This will provide users with a familiar, powerful interface for browsing, editing, and refactoring code directly within the browser, enhanced by the existing AI Architect capabilities.

## User Review Required

> [!IMPORTANT]
> **Key Decision: Editor Technology**
> *   **Monaco Editor**: (VS Code's core). Best performance, richest feature set, but large bundle size.
> *   **CodeMirror 6**: Lighter weight, very extensible, modern API.
> *   *Recommendation*: **Monaco Editor** to give the true "VS Code in the browser" feel users expect from an "IDE".

> [!IMPORTANT]
> **Key Decision: Execution Environment**
> *   **Sandpack (CodeSandbox)**: Runs code client-side. Great for React/Web visualizations. Safer.
> *   **Server-Side Execution**: Requires complex containerization (Docker). Riskier but supports Python/Go/Backend.
> *   *Recommendation*: Start with **Sandpack** for frontend/JS preview, keep backend code as "Editing/Analysis Only" for now.

## Proposed Changes

### Phase 1: Editor Core & Layout
Transform the `Dashboard` layout into a 3-pane IDE interface.

- [ ] **Left Sidebar (File Explorer)**
    - Replace the flat "Recent Files" list with a recursive **File Tree** component.
    - Support folder hierarchy visualization.
    - Add drag-and-drop file moving (future proofing).
    - "Add File", "Add Folder", "Delete" context menus.
- [ ] **Main Area (Tabbed Editor)**
    - Implement a **Tab System** to manage multiple open files.
    - Integrate **Monaco Editor** (via `@monaco-editor/react`) replacing the simple syntax highlighter.
    - Enable **Text Editing**: Users can actually type and modify code.
    - "Unsaved Changes" indicators.
- [ ] **Right Sidebar (AI Assistant)**
    - Keep the existing "AI Architect" chat.
    - Add "Insert at Cursor" button for AI suggestions.
    - Move "Diagrams" and "Docs" into tabs or a secondary panel within this sidebar.

### Phase 2: Project State Management
Moving from "Analysis Records" to "Live Project" state.

- [ ] **Project Context Provider**: Create a React Context to manage `activeFile`, `openFiles` (tabs), and `fileSystem`.
- [ ] **Save Functionality**:
    - Update `PUT /api/files/[id]/raw` to handle content updates.
    - Auto-save drafts to local storage, explicit save to DB/Cloud.
- [ ] **Search Within Project**:
    - Implement a "Command Palette" (`Cmd+K` or `Ctrl+K`) for quick file opening and actions.

### Phase 3: AI Coding Features
Make the AI feel integrated, not just a side-chat.

- [ ] **Code Actions**: "Refactor Selection", "Explain Selection", "Add Types" in the editor context menu.
- [ ] **Diff View**: When AI suggestions are generated, show a `DiffEditor` (Side-by-Side comparison) before applying.
- [ ] **Inline Completion**: (Advanced) Mock a simple "ghost text" completion if possible, or stick to "Generate & Insert".

## Verification Plan

### Automated Tests
- [ ] **Component Test**: FileTree correctly renders nested structures.
- [ ] **Integration Test**: Opening a file adds a tab; closing the last tab clears the editor.
- [ ] **E2E Test**: Edit text in Monaco -> Click Save -> Verify API call -> Verify DB update.

### Manual Verification
- [ ] **Layout**: Check responsiveness on smaller screens (collapse sidebars).
- [ ] **Performance**: Open 10+ tabs and switch between them. Ensure Monaco instances don't leak memory.
- [ ] **AI Interaction**: specific chat requests ("Fix this function") apply changes to the correct active editor tab.
