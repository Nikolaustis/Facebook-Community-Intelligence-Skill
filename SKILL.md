---
name: facebook-group-monitor
description: Two-stage Facebook game-group monitoring with resilient discovery, automatic offline name prefiltering, localized accessibility-label cleanup, About-page validation, language/region resolution, durable checkpoints, and Excel export.
---

# Facebook Group Monitor

## Operating sequence

1. Phase 1 collects Facebook group candidates with canonical URLs, source queries, query-variant types, card member counts, and name-source audit metadata.
2. Phase 1.5 must finish before Phase 2 opens About or discussion pages. It builds a reduced queue and complete audit artifacts while leaving original Phase 1 files unchanged.
3. Phase 2 automatically runs or reuses Phase 1.5 when invoked from the original `phase1_index.json`.
4. Phase 2 validates relevance and sibling collisions, collects About/discussion evidence, resolves language and region, applies thresholds, and writes final outputs.
5. Save a complete checkpoint after every Phase 2 candidate.
6. Final uniqueness is `group_url + game_name`; only same-URL, same-game duplicates may be collapsed.
7. Default to no shutdown. A shutdown may occur only when the current user instruction explicitly permits it and the run passes the shutdown verifier.

## Reliability entrypoints

Run Phase 1 and Phase 2 through the supported npm entrypoints or `npm run monitor`:

```powershell
npm run phase1 -- ...
npm run phase2 -- ...
npm run monitor -- ...
```

These entrypoints use `scripts/run_collector_reliable.js`. The compatibility layer is fail-closed: it only patches known, unique source markers in the current collectors and aborts if upstream code changes make a transformation unsafe.

The reliability layer enforces the following additional runtime rules:

- a missing/unparsed Phase 1 card member count is **inconclusive**, not equivalent to `<100`;
- only a known card member count below 100 may be rejected before About-page validation;
- Phase 1 and Phase 2 use the shared multilingual metrics parser for member/activity counts;
- failed About/discussion fetches are not cached across another game that reaches the same group later in the run;
- PowerShell orchestration must stop on a non-zero Phase 1 / Phase 1.5 / Phase 2 exit code;
- direct `node scripts/phase1_collect_candidates.js` / `node scripts/phase2_collect_details.js` calls intentionally bypass these reliability patches and should not be the normal execution path.

Before a first run on a new machine, use:

```powershell
npm ci
npm run doctor
npm run login
npm run validate-login
npm test
```

## Phase 1 discovery rules

Phase 1 is high-recall discovery. Do not discard a Facebook-returned group only because the visible card text does not contain the current query token.

- Group links are normalized to a canonical group root URL.
- Candidate names may be collected from visible headings, visible anchors, title attributes, image alternatives, accessibility labels, and card text.
- Visible headings and visible links outrank accessibility labels and image alternatives.
- If the primary search surface yields no usable group links, try the fallback Groups search route.
- Search readiness is based on actual result/terminal signals rather than fixed sleep alone.
- Scroll both the document and a large nested scroll container when necessary.
- A completed zero-candidate query must write diagnostic JSON, HTML, and screenshot evidence under `phase1_diagnostics/`.

## Group-name sanitation

Facebook accessibility text is evidence, not an authoritative display name. Remove recognized localized avatar/profile-picture wrappers before relevance matching, language detection, region resolution, checkpointing, and XLSX output.

Examples include:

```text
群组名称的头像
Group name's profile picture
グループ名のプロフィール写真
그룹 이름의 프로필 사진
```

Phase 2 should prefer a valid About-page heading when the Phase 1 name came from a weak accessibility source or the cleaned names agree. Preserve raw-name/source/normalization metadata in audit fields.

## Phase 1.5 name prefilter

Phase 1.5 evaluates every candidate before Facebook detail-page access using:

- canonical game title;
- configured aliases;
- configured search variants;
- the candidate's actual source query/query set;
- safe full-title spacing/punctuation variants;
- sibling-game titles, aliases, and configured variants;
- configured IP roots.

Default disposition:

- Keep a canonical title, safe variant, alias, or valid source-query match.
- Keep seed URLs and missing/truncated names as inconclusive for page verification.
- Reject IP-root-only evidence by default.
- Reject sibling-only evidence by default.
- Reject a shorter title or alias when all of its evidence is contained only inside a more-specific sibling title.

The stage writes:

```text
phase15_prefilter_index.json
phase15_candidates/
phase15_name_prefilter_audit.json
phase15_name_prefilter_rejected.json
phase15_name_prefilter_review.json
phase15_name_prefilter_manifest.json
phase15_name_prefilter_progress.json
```

## Mixed-script and short-alias boundaries

For a target phrase made only of Latin letters/numbers, an adjacent non-Latin script is a valid boundary. A visible space is not required.

Valid examples:

```text
Sailor Piece水手寶石中文交易討論區
All Star Tower Defenseซื้อขาย
Pet Simulator 99中文讨论群
GAG中文交易群
```

Latin-letter and numeric continuation remains blocked:

```text
Sailor Pieces
Sailor PieceMN
All Star Tower DefenseX
Pet Simulator 99100
GAG2 as evidence for GAG
9GAG as evidence for GAG
```

Unicode format controls such as zero-width spaces may separate title tokens.

## Language and region

Resolve language and region from cleaned group names and page evidence. UI accessibility wrappers must not influence language classification.

Use deterministic evidence first, then configured semantic providers and controlled GeoNames fallback. When explicit country evidence maps to a single business-region bucket, preserve that bucket and record the same-business-region source instead of treating it as a cross-region conflict.

## Resume and checkpoint rules

- The original `phase1_index.json` remains the Phase 2 checkpoint identity.
- Phase 1.5 reduced queues are derived artifacts and may be rebuilt.
- Non-finalized checkpoints must be revalidated under current title/sibling/name-sanitation rules before continuing.
- A candidate is considered durable only after its checkpoint row and cursor have been persisted.

## XLSX output contract

The field order defined by the Phase 2 implementation is authoritative. `manual_review` begins with the same public columns as `detail`; review-only fields follow afterward. Missing values remain blank rather than being replaced with zero.

## Runtime safety

- Supervisor and Phase 2 child logs remain isolated.
- Startup success requires a live child plus a fresh readable progress file, not a PID alone.
- JavaScript JSON reads use `scripts/json_io.js`; PowerShell-generated JSON must be UTF-8 without BOM.
- Do not depend on a global `CODEX_CLI_PATH` environment variable.
- Shutdown requires the Node verifier and a current permitted shutdown policy.
- Local machine credentials/config belong under `config/local/` or another ignored `*.local.json` path; never commit them.
- Login validation must require positive authenticated-session evidence and must fail closed on checkpoint, recovery, temporary-block or unknown states.
