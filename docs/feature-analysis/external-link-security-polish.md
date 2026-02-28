# External Link Security Polish

## Summary
Applied security/accessibility polish to external and non-route links in marketing/footer surfaces.

## Changes
- Added `rel="noopener noreferrer"` for `_blank` outbound links:
  - landing hero GitHub CTA
  - site footer GitHub link
  - site footer Twitter link
- Replaced footer `mailto:` usage from Next `Link` to native `<a>`.

## Why this matters
- Prevents reverse-tabnabbing for outbound tabs.
- Aligns link semantics for non-route protocols.
- Improves baseline UX/security hygiene with minimal risk.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: low-medium
