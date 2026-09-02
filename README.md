# Facebook Group Monitor Skill V7.2.0

V7.2.0 is a cumulative overlay for the existing Windows-oriented Skill. It contains the V7.0.1 Phase 1 recovery logic, the V7.1.0 script-aware Phase 1.5 boundary fix, and the V7.2.0 group-name sanitation and language-reclassification fix.

## Workflow

1. Phase 1 searches Facebook through the main and fallback Groups routes, groups all links by canonical group URL, and extracts names from visible headings, visible links, attributes, image alternatives, and accessibility labels.
2. Phase 1.5 sanitizes names and constructs a reduced queue without opening About or discussion pages.
3. Phase 2 sanitizes the Phase 1 name again, fetches About, prefers a valid About heading, recalculates language from the cleaned name and page evidence, and then writes XLSX.

## V7.2.0 correction

Chinese-interface avatar links commonly expose an accessibility label such as:

```text
One Piece Bounty Rush Malaysia 🇲🇾的头像
```

The suffix is UI metadata, not part of the group name. V7.2.0:

- removes localized avatar/profile-picture wrappers;
- gives visible headings a much higher score than `aria-label`;
- records `phase1_name_source`, raw name, normalization reasons, and score;
- prefers a valid About-page heading during Phase 2;
- performs language classification only after name sanitation;
- sanitizes eligible rows restored from a non-finalized checkpoint;
- provides an optional repair tool for already generated XLSX files.

## Commands

```powershell
npm run phase1:test
npm run phase15:test
npm run group-name:test
```

Run Phase 1.5:

```powershell
npm run phase15 -- --index ".\runs\RUN\phase1_index.json" --config ".\runs\RUN\task_config.json" --out-dir ".\runs\RUN_phase15" --force true
```

Repair a previously finalized workbook without overwriting it:

```powershell
npm run repair-avatar-xlsx -- --input ".\runs\RUN\result.xlsx" --output ".\runs\RUN\result_v720_repaired.xlsx"
```

The repair tool creates a `v720_name_repair_audit` worksheet. A fresh Phase 2 run remains the authoritative way to recompute language from About and discussion evidence.

## Installation

Stop active monitor processes, extract the overlay into the existing Skill root, and replace matching files. Preserve `runs/`, `config/`, and `node_modules/`. No new dependency is introduced.
