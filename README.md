# Facebook Game Group Monitor Skill

A Windows-oriented Codex skill for two-stage Facebook game-group monitoring. It performs high-recall group discovery, offline name filtering, page-level validation, language and region classification, checkpointed collection, and Excel export.

## Workflow

1. **Phase 1 — discovery**
   - Searches the primary and fallback Facebook Groups routes.
   - Groups results by canonical Facebook group URL.
   - Extracts candidate names from visible headings, links, attributes, image alternatives, and accessibility labels.
   - Keeps discovery high-recall and records source-query/name-source metadata for later auditing.

2. **Phase 1.5 — offline name prefilter**
   - Runs before Phase 2 opens Facebook About or discussion pages.
   - Uses canonical titles, aliases, configured search variants, source queries, sibling-game titles, and IP-root rules.
   - Supports Latin titles directly adjacent to Chinese, Thai, Lao, Arabic, Hangul, Cyrillic, and other non-Latin scripts.
   - Writes a reduced queue plus complete audit/review/rejection files without modifying the original Phase 1 files.

3. **Phase 2 — detail collection**
   - Automatically runs or reuses Phase 1.5 before connecting to Facebook detail pages.
   - Sanitizes localized accessibility labels such as `的头像` and profile-picture wrappers.
   - Prefers a valid About-page heading over weak accessibility-label names.
   - Resolves relevance, activity, language, region, collisions, and manual-review cases.
   - Saves a durable checkpoint after every candidate and exports XLSX/JSON results.

## Requirements

- Windows with PowerShell.
- Node.js and npm.
- Google Chrome or another Chromium browser compatible with the configured CDP endpoint.
- A Facebook account logged in through the dedicated browser profile used by the skill.

Install dependencies:

```powershell
npm ci
```

## Main commands

Open the browser used by the collector:

```powershell
npm run login
```

Validate the Facebook login state:

```powershell
npm run validate-login
```

Run Phase 1:

```powershell
npm run phase1 -- --games "Game A,Game B" --out-dir ".\runs\example" --config ".\task_config.json"
```

Run Phase 1.5 manually when you want to inspect the reduced queue before Phase 2:

```powershell
npm run phase15 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json" --out-dir ".\runs\example"
```

Run Phase 2. Phase 1.5 is executed or reused automatically before Facebook detail pages are opened:

```powershell
npm run phase2 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json"
```

Run regression checks:

```powershell
npm test
```

## Output files

Typical run outputs include:

```text
phase1_index.json
phase15_prefilter_index.json
phase15_name_prefilter_audit.json
phase15_name_prefilter_rejected.json
phase15_name_prefilter_review.json
phase15_name_prefilter_manifest.json
phase15_name_prefilter_progress.json
fb_monitoring_filtered.xlsx
fb_monitoring_filtered_summary.json
collision_report.json
audit_stats.json
debug_rows.json
phase2_autosave_state.json
phase2_progress.json
```

When Phase 1 ends with no candidates despite a completed search attempt, diagnostic JSON, HTML, and screenshots are written under `phase1_diagnostics/`.

## Repairing an existing workbook

A previously generated workbook containing localized avatar-label text in `group_name` can be repaired without overwriting the source file:

```powershell
npm run repair-avatar-xlsx -- --input ".\runs\example\result.xlsx"
```

The default repaired filename ends in `_name_repaired.xlsx`, and the workbook contains a `name_repair_audit` sheet. A fresh Phase 2 run remains the preferred method when language and region should be recomputed from Facebook page evidence.

## Configuration

Start from `assets/task_config.template.json`. Keep machine-specific API/provider settings in local configuration files rather than committing credentials or runtime data to the repository.

For installation and upgrade instructions, see [INSTALLATION.md](INSTALLATION.md).
