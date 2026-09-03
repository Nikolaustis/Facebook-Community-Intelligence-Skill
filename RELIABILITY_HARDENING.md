# Reliability hardening

The project preserves the mature Phase 1 / Phase 2 collector files and applies a small, fail-closed compatibility layer through the supported npm and monitor entrypoints.

## What it changes

1. **Unknown card member counts are inconclusive, not `<100`.** Phase 2 only rejects a card before About when a numeric card count is known and below 100.
2. **Shared multilingual metrics parser.** Phase 1 card member parsing and Phase 2 group-size/activity parsing share `scripts/facebook_metrics_parser.js`, including compact `K/M/万` values and common Facebook UI languages.
3. **Transient failures are not cached.** Failed About/discussion fetches are retried when the same group is reached through another game in the same run.
4. **PowerShell orchestration fails closed.** Phase 1, Phase 1.5 and Phase 2 non-zero exit codes stop `run_multi_games_reliable.ps1`; final XLSX presence is checked before reporting completion.
5. **Safer local config handling.** `config/local/`, nested `*.local.json`, secret and credential patterns are ignored.
6. **Portable browser bootstrap.** Chrome/Edge discovery and a stable `%LOCALAPPDATA%` profile replace a fixed temporary-path dependency.
7. **Stronger session validation.** Login validation uses authenticated cookie evidence and explicit blocked/interstitial classifications.
8. **Environment doctor.** `npm run doctor` reports deployment problems before a long run.
9. **Regression coverage.** CI checks the JavaScript entrypoints plus multilingual metric and patch-contract tests.

## Why a compatibility runner is used

`phase2_collect_details.js` contains substantial, already-working matching, language, region, geocoder, semantic, checkpoint and shutdown logic. Replacing that whole file for a small reliability update would create unnecessary regression risk.

`scripts/run_collector_reliable.js` reads the current collector source, applies only source transformations whose exact markers are verified, writes a temporary sibling runtime file, runs it, and removes the temporary file afterward. If an upstream edit changes any required marker or makes a replacement ambiguous, execution stops with a clear error instead of silently applying an unsafe patch.

Use:

```powershell
npm run phase1 -- ...
npm run phase2 -- ...
npm run monitor -- ...
```

Do not bypass the reliability runner with direct `node scripts/phase1_collect_candidates.js` or `node scripts/phase2_collect_details.js` calls unless you intentionally want the unpatched collector behavior.
