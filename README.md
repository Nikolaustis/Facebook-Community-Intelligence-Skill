# Facebook Group Monitor Skill V7.0.0

V7.0.0 adds a true **Phase 1.5** between first-round Facebook search and second-round page collection. The previous release performed a lightweight name check inside the phase-2 loop; V7 first traverses the entire phase-1 queue offline, removes obvious search noise, writes a reduced queue and audit files, and only then connects to Facebook detail pages.

## Why this change

The supplied historical workbook contains 7,501 retained rows across 62 games. Approximately 96.8% of retained names contain the canonical title after safe punctuation/spacing normalization. Most remaining legitimate cases are explained by:

- configured acronyms or expanded search terms;
- localized titles;
- final-token singular/plural variation;
- removal of connector words while preserving the full identifying title;
- punctuation or spacing differences such as `GAG2`, `GAG 2`, and `GAG-2`.

The workbook also exposes legacy false-positive patterns, especially short aliases inside longer words or numbered sibling titles. V7 therefore uses boundary-aware and sibling-aware matching rather than raw substring filtering.

## Workflow

1. Phase 1 collects candidates and source-query metadata.
2. Input validation checks the original index, candidate files, config, and shutdown policy.
3. Phase 1.5 builds a reduced queue from first-round group names.
4. Phase 2 opens About/discussion pages only for retained or inconclusive candidates.
5. Existing relevance, scale, activity, language, region, collision, checkpoint, finalization, and shutdown rules continue unchanged.

## Phase 1.5 outputs

Each run directory receives:

```text
phase15_prefilter_index.json          filtered index used internally by phase 2
phase15_candidates/                   per-game filtered candidate files
phase15_name_prefilter_audit.json     aggregate and per-game counts/reasons/examples
phase15_name_prefilter_rejected.json  complete rejected-candidate audit
phase15_name_prefilter_review.json    seed/missing/truncated or configured review candidates
phase15_name_prefilter_manifest.json  deterministic cache fingerprint
phase15_name_prefilter_progress.json  Phase 1.5 progress and completion state
```

Original phase-1 files are never overwritten.

## Default filtering policy

| Evidence in first-round group name | Phase 1.5 action |
|---|---|
| Canonical title / safe spacing variant | Keep |
| Configured alias or expanded query | Keep |
| Candidate's actual source query | Keep only when it appears in the name and is not solely a sibling title/alias |
| Seed URL | Keep for page verification |
| Missing or visibly truncated name | Keep as inconclusive |
| IP root only | Reject by default |
| Sibling title only | Reject by default |
| Shorter title only inside a more-specific sibling | Reject |
| No title/alias/query evidence | Reject |

## Configuration

```json
"phase15_name_prefilter": {
  "enabled": true,
  "reuse_cache": true,
  "keep_missing_or_truncated_names": true,
  "keep_ip_root_only": false,
  "keep_sibling_only_for_manual_review": false,
  "use_source_queries": true,
  "minimum_query_compact_length": 3,
  "write_rejected_candidates": true,
  "write_review_candidates": true,
  "max_examples_per_reason": 20
}
```

The existing `phase2_name_prefilter` remains active as a second defensive check.

## Commands

```powershell
npm run phase15 -- --index ".\runs\<run>\phase1_index.json" --config ".\config\task.json"
npm run phase15:test
npm run phase2 -- --index ".\runs\<run>\phase1_index.json" --config ".\config\task.json"
```

`phase2_collect_details.js` automatically runs or reuses Phase 1.5 before connecting to Facebook, so scheduled/background workflows require no manual extra step.

## Preserved protections

- Safe short-alias and numbered-continuation boundaries.
- Sibling-title/alias/configured-variant exclusion.
- `group_url + game_name` multi-game uniqueness.
- Same-business-region preservation.
- Complete checkpoint after every candidate.
- Supervisor/child log isolation and startup health verification.
- API-first semantic resolver chain and controlled GeoNames fallback.
- BOM-safe JSON handling.
- Node-verified shutdown and default no-shutdown behavior.

## Installation

Stop active monitor processes, extract the archive into the existing Skill root, and replace matching files. Preserve:

```text
runs/
config/
node_modules/
```

No new npm dependency is required.
