# Bulk Regenerate Input Normalization Hardening

## Summary
Hardened `POST /api/regenerate/bulk` with stricter file-id normalization and cleaner failure handling in batch processing.

## Changes
- Tightened `fileIds` schema:
  - trims ids
  - enforces max length per id (`100`)
- Added deduplication/normalization before DB query (`Set` over trimmed IDs).
- Removed per-file `console.error` logging from production path.
- Updated audit details to report normalized requested count.

## Why this matters
- Reduces malformed/duplicate ID amplification in batch operations.
- Improves reliability and consistency of bulk regeneration execution.
- Aligns with production logging hygiene expectations.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
