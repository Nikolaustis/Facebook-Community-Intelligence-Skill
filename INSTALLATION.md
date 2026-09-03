# Installation and Upgrade

## Fresh installation

Clone or download the repository, open PowerShell in the repository root, and install dependencies:

```powershell
npm ci
```

Run the environment doctor before the first collection:

```powershell
npm run doctor
```

The doctor checks Node/dependencies, a supported Chrome/Edge installation, the dedicated browser-profile directory, local-config `.gitignore` protection, task-config JSON, and the CDP endpoint. A CDP warning is normal before the dedicated browser is started.

Start the dedicated Chromium session:

```powershell
npm run login
```

`npm run login` now discovers Google Chrome or Microsoft Edge automatically. The default persistent profile is stored under `%LOCALAPPDATA%\FacebookGameGroupMonitor\browser-profile`. You can override it with `FBM_BROWSER_PROFILE`, and you can override the browser executable with `FBM_BROWSER_PATH` or the PowerShell `-BrowserPath` parameter.

Log in to Facebook in that browser window, then verify the session:

```powershell
npm run validate-login
```

Login validation requires positive authenticated-session evidence (`c_user`) and rejects checkpoint, recovery, login, temporary-block and common interstitial states instead of treating any long Facebook page as logged in.

Copy `assets/task_config.template.json` to a working configuration file and edit the games, aliases, sibling titles, regions, thresholds, and optional semantic/geocoder settings required for the run.

Run the regression checks before the first collection:

```powershell
npm test
```

Use the npm entrypoints or `npm run monitor` for Phase 1 / Phase 2. They apply the reliability compatibility layer that keeps the current collector logic intact while fixing metric parsing, unknown-card-size handling and transient-cache behavior.

```powershell
npm run phase1 -- --games "Game A,Game B" --out-dir ".\runs\example"
npm run phase2 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json"
```

## Upgrading an existing installation

1. Stop active Phase 1, Phase 1.5, Phase 2, supervisor, scheduled-run, and shutdown-watcher processes.
2. Back up the current skill directory if you need a rollback point.
3. Copy the update files into the existing skill root and replace matching files.
4. Preserve local runtime data and machine-specific settings, especially:

```text
runs/
node_modules/
config/local/
config/*.local.json
```

5. Run:

```powershell
npm ci
npm test
npm run doctor
```

6. Start/reuse the dedicated browser and validate login:

```powershell
npm run login
npm run validate-login
```

## Reusing existing run data

- Original Phase 1 candidate files are never overwritten by Phase 1.5.
- Existing clean Phase 1 data can be reused.
- If you are reusing a reduced queue produced by an older installation, rebuild it from the original `phase1_index.json` before continuing Phase 2. You can force a rebuild with:

```powershell
npm run phase15 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json" --out-dir ".\runs\example" --force true
```

- Do not use `phase15_prefilter_index.json` as the long-term checkpoint identity; keep the original `phase1_index.json` as the Phase 2 entry point.
