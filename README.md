# Facebook Game Group Monitor Skill — V8.0.0

A Windows-oriented Codex skill for two-stage Facebook **game-group** monitoring. V8.0.0 is the mature Game-centric baseline: it combines high-recall discovery, offline name prefiltering, page-level validation, multilingual metric parsing, language/region resolution, durable checkpoints, audited Excel export, and hardened foreground/background execution.

> V8.0.0 deliberately retains the `Game -> Facebook Group` domain model. The later Community Intelligence / Subject model is not part of this release.

## Pipeline

1. **Phase 1 — high-recall discovery**
   - Searches primary and fallback Facebook Groups routes.
   - Canonicalizes Facebook group URLs.
   - Extracts candidate names from headings, links, attributes, image alternatives, accessibility labels, and card text.
   - Preserves source-query and name-source audit metadata.

2. **Phase 1.5 — offline name prefilter**
   - Runs before detail-page access.
   - Uses canonical titles, aliases, configured variants, source queries, sibling-game titles, and IP-root rules.
   - Supports mixed-script boundaries such as Latin titles adjacent to Chinese/Thai/Arabic/Hangul/Cyrillic text.
   - Writes reduced queues plus complete audit/review/rejection artifacts while preserving the original Phase 1 index.

3. **Phase 2 — page validation and enrichment**
   - Validates relevance and sibling collisions.
   - Reads About/discussion evidence.
   - Parses group size and activity metrics across supported localized Facebook UI formats.
   - Resolves language and region.
   - Applies scale/activity thresholds.
   - Writes checkpointed XLSX/JSON outputs and manual-review records.

## V8.0.0 reliability hardening

V8.0.0 adds a reliability layer around the mature collectors rather than rewriting them:

- `npm run doctor` checks Node, browser/CDP, profile/login readiness, configuration, and runtime prerequisites.
- `npm run phase1` / `npm run phase2` run through a verified reliability wrapper.
- Unknown/unparsed card member counts are forwarded to About-page verification instead of being misclassified as `<100`.
- About/discussion transient failures are not cached as reusable evidence.
- Shared multilingual metric parsing handles additional localized Facebook formats and `K / M / 万`-style counts.
- Browser startup supports Chrome/Edge discovery and a machine-local dedicated profile path.
- Login validation distinguishes authenticated state from login/checkpoint/challenge/interstitial failure states.
- Foreground, background, scheduled Phase 2, and handoff paths use the same hardened entrypoints.
- Regression and contract tests fail closed when upstream collector source markers no longer match the verified patch assumptions.

See [`RELIABILITY_HARDENING.md`](RELIABILITY_HARDENING.md) for implementation details.

## Requirements

- Windows + PowerShell
- Node.js 18+
- npm
- Google Chrome or Microsoft Edge / compatible Chromium browser
- A Facebook account logged in through the dedicated local browser profile

## Installation

```powershell
npm ci
npm run doctor
npm test
```

Open the dedicated browser profile and log in:

```powershell
npm run login
npm run validate-login
```

## Main commands

Phase 1:

```powershell
npm run phase1 -- --games "Game A,Game B" --out-dir ".\\runs\\example" --config ".\\task_config.json"
```

Phase 1.5:

```powershell
npm run phase15 -- --index ".\\runs\\example\\phase1_index.json" --config ".\\task_config.json" --out-dir ".\\runs\\example"
```

Phase 2:

```powershell
npm run phase2 -- --index ".\\runs\\example\\phase1_index.json" --config ".\\task_config.json"
```

Complete monitored workflow:

```powershell
npm run monitor
```

## Typical outputs

```text
phase1_index.json
phase15_prefilter_index.json
phase15_name_prefilter_audit.json
phase15_name_prefilter_rejected.json
phase15_name_prefilter_review.json
fb_monitoring_filtered.xlsx
fb_monitoring_filtered_summary.json
collision_report.json
audit_stats.json
debug_rows.json
phase2_autosave_state.json
phase2_progress.json
```

## Runtime safety

- Preserve `runs/`, `node_modules/`, and machine-local `config/*.local.json` during upgrades.
- The original `phase1_index.json` remains the long-term checkpoint identity.
- Do not commit browser profiles, cookies, credentials, provider secrets, or runtime data.
- Shutdown is disabled by default and only runs when the current instruction explicitly permits it and the shutdown verifier passes.

## Release line

- **V8.0.0** — mature Game-centric baseline + reliability hardening.
- V7.x historical design/incident documents remain in the repository as development history.

For installation/upgrade details, see [`INSTALLATION.md`](INSTALLATION.md).
