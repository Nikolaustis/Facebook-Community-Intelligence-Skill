# V7.0.1 Overlay Instructions

1. Stop every active Facebook Group Monitor process before replacing files.
2. Extract this archive into the existing Skill root and replace matching files.
3. Preserve existing directories:

```text
runs/
config/
node_modules/
```

4. No new npm dependency is required.
5. Run both regression checks once:

```powershell
npm run phase1:test
npm run phase15:test
```

6. Start phase 2 normally. V7 automatically runs or reuses Phase 1.5 before connecting to Facebook.
7. For an existing unfinished V6 checkpoint, keep the original `phase1_index.json`; V7 retains that path as the checkpoint identity and builds filtered queues beside it.
8. Existing finalized XLSX files are not rewritten automatically. Run a fresh second round for V7-filtered results.

9. Re-run Phase 1 for any game whose older run produced `total_candidates: 0`. Phase 1.5 cannot recover links that were never collected.
10. If a query still ends at zero, send the matching files from `runs\<run>\phase1_diagnostics\`; do not send only the final console summary.
