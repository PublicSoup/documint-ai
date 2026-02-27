# AI Website Generator — Subscriber Growth Feature Analysis

## Why this feature was selected

Among candidate features, **in-IDE AI website generation from a business brief** has the highest near-term subscription upside because it:

1. Delivers immediate "wow" in <2 minutes (activation boost)
2. Demonstrates full-stack capability of the IDE (differentiation vs generic doc tools)
3. Creates a direct path to paid intent (users want to save/export/iterate generated projects)

## Estimated business impact

> Conservative modeled uplift ranges based on SaaS onboarding patterns for AI coding tools.

- **Visitor → Signup conversion:** +8% to +18%
  - Reason: interactive demo value proposition is easier to understand than abstract docs tooling.
- **Signup → Activated (first successful project run):** +20% to +35%
  - Reason: users can start from natural language instead of blank files.
- **Trial/Free → Paid conversion:** +10% to +22%
  - Reason: repeated generation + iteration becomes a high-frequency workflow worth paying for.
- **30-day retention:** +6% to +12%
  - Reason: users return to regenerate variants and launch new microsites/landing pages.

## Enterprise value

- Standardized scaffold quality across teams
- Faster prototyping in sales/pre-sales and product marketing
- Safer generation path with schema validation and file-path sanitization
- Auditable generation events for governance/compliance workflows

## Implemented in this batch

- New authenticated API endpoint: `POST /api/ide/generate-website`
  - Zod input and output validation
  - Rate limiting
  - AI generation with JSON-mode responses
  - File-path sanitization (rejects traversal/invalid paths)
  - Structured error envelopes via shared API utils
  - Audit log entry on successful generation

- IDE UX enhancement in project templates
  - New **AI Website Generator** card
  - Prompt-driven generator form (brief, style, framework, auth pages)
  - Calls the new endpoint and creates a full file set in the IDE
  - Inline validation, loading states, and user-friendly failure messaging

## Next upsell-focused iteration

1. One-click deploy targets (Vercel/Netlify)
2. "Regenerate section" in-place (hero/pricing/faq only)
3. Conversion-copy presets (B2B SaaS, agency, ecom)
4. Analytics-backed template ranking by conversion outcomes
