# V7.0.0 Patch Notes

- Added an explicit offline **Phase 1.5 group-name prefilter** before phase-2 Facebook page collection.
- Phase 1.5 traverses every first-round candidate and creates a reduced per-game queue before About/discussion pages are opened.
- Added source-query-aware matching using `source_query` and merged `source_queries`; a Facebook search hit is retained only when the relevant query/title evidence appears in the group name, and a sibling-owned query cannot override sibling exclusion.
- Added historical-safe full-title variants derived from the supplied 7,501-row workbook: punctuation/spacing normalization, final-token singularization, and conservative connector-word elision.
- Added complete Phase 1.5 artifacts: filtered index, per-game queues, audit, rejected candidates, review candidates, cache manifest, and progress file.
- Added deterministic cache reuse based on original index, candidate-file metadata, and all relevance-related configuration.
- Defaulted IP-root-only and sibling-only candidates to rejection at Phase 1.5 while preserving seed URLs and missing/truncated names for page verification.
- Preserved safe short-alias boundaries: `GAG` cannot match `gags`, `gagged`, `9gag`, `GAG2`, or `GAG 2`; `GAG2` accepts compact and separated forms.
- Preserved legitimate multi-game groups when each target has independent title evidence.
- Retained the prior in-loop phase-2 name prefilter as a second defensive layer.
- Added `npm run phase15`, `npm run phase15:test`, and 15 regression cases.
- Preserved all V6.6.4 region, semantic-provider, checkpoint, supervisor-log, XLSX, multi-game, and shutdown protections.
