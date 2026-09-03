---
name: facebook-community-intelligence
description: Facebook Group discovery and Community Intelligence with Subject/Community/Match modeling, backward-compatible game configuration, reliable collection, evidence reuse, evaluation, and audited export.
---

# Facebook Community Intelligence

Use `Subject ↔ Community ↔ Match`.

- `Subject`: game, brand, product, app, creator, company, topic, event, competitor, franchise, or custom entity.
- `Community`: canonical Facebook Group entity.
- `Match`: Subject-specific relevance decision.
- Evidence belongs to the Community and is reusable across Subject matches.

## Preferred workflow

```powershell
npm run intelligence -- --config .\subject_config.json --out-dir .\runs\example
```

`subjects` and `--subjects` are primary. Existing `games` configuration and `--games` remain compatibility inputs and are migrated automatically.

## Sequence

1. Build a Subject-oriented discovery plan.
2. Translate Subject configuration to the mature collector compatibility contract.
3. Run reliable Phase 1 discovery.
4. Run Phase 1.5 before detail-page access.
5. Run Phase 2 validation/enrichment.
6. Normalize validated rows into unique Communities.
7. Store evidence independently from Subject matching.
8. Build Community/Subject matches.
9. Export normalized JSON/XLSX and a run manifest.

## Reliability invariants

- Missing/unparsed card member counts are inconclusive.
- Failed About/discussion fetches must not become reusable successful evidence.
- Foreground/background orchestration stops on non-zero child exit codes.
- `npm run monitor:bg` must ultimately use `run_multi_games_reliable.ps1`.
- Login validation fails closed on checkpoint, recovery, temporary block, login, or unknown states.
- PowerShell CI parsing uses `pwsh` for consistent UTF-8 handling.

## Matching invariants

- Canonical titles and safe aliases are strong evidence.
- Latin titles may be adjacent to non-Latin scripts.
- Latin/numeric continuation blocks short aliases and truncated matches.
- A more-specific mutually-exclusive Subject must not be accepted merely because it contains a shorter Subject title.
- IP-root-only evidence is review-level by default.
- Seed URLs may be accepted as explicit discovery evidence.

## Preferred outputs

`subjects.json`, `communities.json`, `community_subject_matches.json`, `community_evidence.json`, `community_intelligence.xlsx`, and `run_manifest.json`.

`legacy_flattened.json` is a compatibility view, not the canonical model.

## Evaluation

```powershell
npm test
npm run benchmark
npm run eval:ai
```

Bundled evaluation cases are synthetic and must not be represented as production accuracy.

## Source boundary

Facebook Groups is implemented through `src/sources/facebook_groups.js`. Do not claim another source until a real adapter and tests exist.
