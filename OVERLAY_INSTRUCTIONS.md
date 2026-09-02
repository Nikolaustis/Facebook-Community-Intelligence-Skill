# V7.2.0 Installation / Overlay Instructions

1. Stop all active Facebook Group Monitor, Phase 1, Phase 1.5, Phase 2, supervisor, and scheduled-run processes.
2. Back up the current Skill directory.
3. Extract this archive into the existing Skill root and replace matching files.
4. Preserve existing `runs/`, `config/`, and `node_modules/` directories.
5. No new npm dependency is required.
6. Run:

```powershell
npm run phase1:test
npm run phase15:test
npm run group-name:test
```

7. For new collection, rerun Phase 1 so the improved source scoring is available. Existing clean Phase 1 data can be reused, because Phase 1.5 and Phase 2 also sanitize legacy names.
8. Do not reuse a V7.0.x/V7.1.x Phase 1.5 cache. V7.2.0 uses a new cache version and `--force true` is recommended for the first rerun.
9. For already finalized XLSX files, use `npm run repair-avatar-xlsx` to create a new repaired workbook, or rerun Phase 2 for full language recomputation from Facebook evidence.
10. The repair tool never overwrites the source workbook.
