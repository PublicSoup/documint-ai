# API Hardening Batch: `/api/analyze`

## Summary
Applied server-side hardening to upload + analyze route with stricter input handling and standardized error behavior.

## Implemented
- Added strict file payload validation:
  - rejects non-File entries in `files`
  - rejects empty upload requests
  - enforces max files per request (`MAX_FILES_PER_REQUEST = 20`)
- Replaced custom 403 JSON branch with standardized error envelope via `errorResponse(ApiErrors.forbidden(...))`.
- Removed bare console warning from parser failure path.
- Preserved parser-failure observability by:
  - capturing `parseWarning`
  - including warning in audit details
  - appending warning to `securityInsights` for response visibility

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** fewer malformed-upload failures reaching deeper pipeline.
- **Paid conversion:** improved reliability during core product interaction.
- **Retention:** stronger route resilience and more consistent API behavior.

## Risk
- Low risk; changes are additive validation + consistency hardening.
- Verify/commit remains blocked until exec backend is restored.
