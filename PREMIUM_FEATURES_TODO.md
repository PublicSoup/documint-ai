# 💎 Premium Features TODO
*Focusing on high-value features that drive upgrades*

## 🚀 Phase 1: Visual & Utility Value (Immediate)

### 1. Code-to-Diagram Generator (Mermaid.js)
**Why pay for it?** Visualizing code architecture is difficult and valuable for onboarding/docs.
- [x] Create `GraphGenerator` component using Mermaid.js (`DiagramViewer`)
- [x] Add `/api/diagram/generate` endpoint (Gated: Pro+)
- [x] Implementation:
    - [x] Parse code structure
    - [x] Prompt AI to generate Mermaid syntax
    - [x] Render in UI with zoom/pan
    - [x] Export as SVG/PNG

### 2. Custom Documentation Templates
**Why pay for it?** Teams need to enforce their specific style guide (e.g., Google Style, Company Specific).
- [x] Create `TemplateEditor` UI in settings (`TemplateManager`)
- [x] Add `DocTemplate` model to Prisma
- [x] Add CRUD endpoints for templates (Gated: Pro+)
- [x] Update generation logic to respect user-selected template
- [x] "One-click apply" to existing docs (Partial: via Reactivation)

### 3. Professional Exports
**Why pay for it?** Sharing documentation off-platform (PDF reports, offline HTML).
- [ ] Add "Export" button to document view
- [ ] Implement PDF generation (using `html2canvas` + `jspdf` or server-side)
- [ ] Implement static HTML site export (mini Docusaurus-lite)
- [ ] Gated: Starter+ (Basic), Pro+ (White-label/PDF)

---

## 👥 Phase 2: Collaboration & Enterprise (Next)

### 4. Review & Approval Workflow
**Why pay for it?** Managers/Leads want to control documentation quality.
- [ ] Add `status` field to Documentation (Draft, Pending Review, Approved)
- [ ] Create "Request Review" action
- [ ] Create Reviewer Dashboard (Team+ only)

### 5. Verified/Certified Documentation
**Why pay for it?** Trust. Know which docs are up-to-date.
- [ ] Add "Verified by [User]" badge
- [ ] Auto-expire verification on code changes (needs hash comparison)

---

## 🛠️ Implementation Plan (Current Session)

1.  **Diagram Generation**:
    *   Add `mermaid` dependency.
    *   Create AI prompt for "Code to Mermaid Class/Sequence Diagram".
    *   Build UI visualization.
2.  **System Prompt/Templates**:
    *   Allow users to edit the "System Prompt" used for doc generation.
    *   Save these as presets.
