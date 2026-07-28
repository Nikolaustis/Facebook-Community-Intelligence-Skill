---
name: facebook-group-monitor
version: 7.0.1
description: Two-stage Facebook game-group monitoring with resilient first-round extraction, dual-route false-zero recovery, explicit Phase 1.5 name-relevance queue prefilter, source-query and expanded-query evidence, safe short-alias boundaries, sibling-title suppression, durable recovery, verified Windows startup, multi-game output, semantic region adjudication, and prompt-driven shutdown.
---

# Facebook Group Monitor V7.0.1

## Operating sequence

1. Phase 1 collects candidates and preserves `source_query`, `source_queries`, query-variant types, source game, card name, URL, and card member count.
2. Validate the phase-2 index, task config, shutdown policy, and every original candidate file.
3. Run **Phase 1.5 name prefiltering before any phase-2 Facebook page is opened**.
4. Phase 1.5 traverses every first-round group name and evaluates:
   - canonical game title;
   - punctuation/spacing variants;
   - configured aliases;
   - configured expanded search terms;
   - the candidate's actual `source_query` and `source_queries`;
   - safe singular/full-title and connector-elision variants derived from the historical positive corpus;
   - sibling-game titles, aliases, and configured variants;
   - configured IP roots.
5. Write a reduced candidate queue and full audit artifacts, then start phase-2 detail collection from the reduced queue.
6. Keep the existing in-loop phase-2 name prefilter as a second defensive check.
7. Resolve language and region with deterministic evidence first, then configured APIs, verified standalone Codex CLI, local rules, and controlled GeoNames.
8. Save a complete checkpoint after every phase-2 candidate.
9. Generate aligned `detail` and `manual_review` sheets using the authoritative field order.
10. Close Chrome after verified finalization. Default to no shutdown; use only the current run's explicit shutdown instruction.

## Mandatory Phase 1 high-recall and false-zero rule

Phase 1 must collect canonical group URLs returned by Facebook without using query-token presence as a hard rejection. It must extract a candidate name from same-URL link text, headings, accessibility labels, title attributes, or nearby card lines, and preserve the extraction source as audit metadata.

When the primary search surface contains no actual group links, retry the alternate Facebook Groups search surface once. Search readiness must be based on an actual group link or terminal page signal, not a fixed sleep alone. Scroll both the document and the largest nested scroll container.

Any query that still ends at zero must create `phase1_diagnostics/*.json`, `*.html`, and `*.png`. Distinguish login/checkpoint, temporary Facebook error, explicit no-results text, raw group links present, and unresolved zero after route fallback. Never report an unresolved extractor zero merely as “no groups found.”

## Mandatory Phase 1.5 rule

Phase 1.5 is an offline queue-construction stage. It must finish before `/about` or discussion pages are opened.

Default disposition:

- Keep: canonical title, alias, configured variant, or actual source query appears independently in the group name.
- Keep: seed URL, missing name, or visibly truncated name, because name-only judgment is inconclusive.
- Reject: no title, alias, or source-query evidence in the group name.
- Reject: only an IP root appears.
- Reject: only a sibling game appears.
- Reject: the shorter target evidence exists only inside a more-specific sibling title.

Phase 1.5 must write:

```text
phase15_prefilter_index.json
phase15_name_prefilter_audit.json
phase15_name_prefilter_rejected.json
phase15_name_prefilter_review.json
phase15_name_prefilter_manifest.json
phase15_name_prefilter_progress.json
phase15_candidates/*.json
```

The original `phase1_index.json` and original candidate JSON files must remain unchanged.

## Mandatory search-query rule

The actual first-round `source_query` and merged `source_queries` may validate a group name even when the canonical English title is absent, which is required for acronyms, localized titles, and configured expansions.

A source query is not accepted merely because Facebook returned the card. The query itself must appear in the group name under the same safe boundary rules. Generic short terms such as region codes, `global`, `trade`, `official`, `group`, or `community` cannot independently qualify a candidate. A source query that exactly belongs to a sibling title or sibling alias cannot override sibling exclusion for the target game.

## Mandatory short-alias rule

Never use unrestricted substring matching for a short Latin alias. A short alias must be a standalone token with Latin-letter/number boundaries.

```text
GAG  → valid standalone alias
GAGS / GAGGED / 9GAG → not GAG
GAG2 / GAG 2 / GAG-2 → valid GAG2, not GAG
```

## Mandatory sibling rule

Sibling exclusion includes every sibling game's canonical title, aliases, configured variants, and historical-safe full-title variants.

A shorter target is rejected only when all its evidence is embedded inside a more-specific sibling form. A group name that independently contains two complete target games may still be retained once under each game.

## Mandatory cache and resume rule

Phase 1.5 uses a deterministic cache fingerprint covering:

- phase-1 index metadata;
- every candidate file's path, size, and modification time;
- aliases, sibling titles, IP roots, title variants, and Phase 1.5 options.

If inputs are unchanged, resume uses the cached reduced queue. The phase-2 checkpoint continues to reference the original `phase1_index.json`, preserving durable resume compatibility.

## Mandatory multi-game output rule

Final uniqueness remains:

```text
group_url + game_name
```

Only same-URL, same-game duplicates may be collapsed, keeping the highest score.

## Mandatory supervisor, JSON, and shutdown rules

- Supervisor and phase-2 child logs remain isolated.
- Startup success requires a live child and a fresh readable progress file; Phase 1.5 writes progress immediately.
- Never depend on the global `CODEX_CLI_PATH` variable.
- JavaScript JSON reads use `scripts/json_io.js`; PowerShell-generated JSON is UTF-8 without BOM.
- Shutdown requires `scripts/verify_shutdown_state.js` and a current permitted shutdown policy.

## XLSX output contract

The existing workbook field order is authoritative. `manual_review` begins with the same columns as `detail`; review-only fields follow. Phase 1.5 audit fields belong to JSON queue/audit artifacts and must not reorder existing XLSX columns.
