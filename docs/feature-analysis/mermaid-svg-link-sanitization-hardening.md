# Feature Impact: Mermaid SVG Link Sanitization Hardening

## Summary
Hardened Mermaid SVG sanitization by allowlisting safe link schemes and stripping unsafe `href`/`xlink:href` values.

## Technical Changes
- `src/components/diagram-viewer.tsx`
  - Added `isSafeSvgUrl` helper.
  - Sanitizer now removes non-allowlisted URL schemes from SVG links (e.g., `javascript:`, `data:`).
  - Safe values preserved: hash links, relative paths, `http`, `https`, `mailto`, `tel`.

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium (safer diagram interactions in IDE/visualizer)
- Paid conversion: Low-Medium (trust/security posture)
- Retention: Medium (enterprise security confidence)

## Risk Notes
- No rendering behavior changes for valid links.
- Security hardening is backward-compatible for standard Mermaid output.
