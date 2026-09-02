# Installation and Upgrade

## Fresh installation

Clone or download the repository, open PowerShell in the repository root, and install dependencies:

```powershell
npm ci
```

Start the dedicated Chromium session:

```powershell
npm run login
```

Log in to Facebook in that browser window, then verify the session:

```powershell
npm run validate-login
```

Copy `assets/task_config.template.json` to a working configuration file and edit the games, aliases, sibling titles, regions, thresholds, and optional semantic/geocoder settings required for the run.

Run the regression checks before the first collection:

```powershell
npm test
```

## Upgrading an existing installation

1. Stop active Phase 1, Phase 1.5, Phase 2, supervisor, scheduled-run, and shutdown-watcher processes.
2. Back up the current skill directory if you need a rollback point.
3. Copy the update files into the existing skill root and replace matching files.
4. Preserve local runtime data and machine-specific settings, especially:

```text
runs/
node_modules/
config/*.local.json
```

5. Remove obsolete duplicate files listed in the accompanying upgrade instructions.
6. Run:

```powershell
npm ci
npm test
```

## Reusing existing run data

- Original Phase 1 candidate files are never overwritten by Phase 1.5.
- Existing clean Phase 1 data can be reused.
- If you are reusing a reduced queue produced by an older installation, rebuild it from the original `phase1_index.json` before continuing Phase 2. You can force a rebuild with:

```powershell
npm run phase15 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json" --out-dir ".\runs\example" --force true
```

- Do not use `phase15_prefilter_index.json` as the long-term checkpoint identity; keep the original `phase1_index.json` as the Phase 2 entry point.
