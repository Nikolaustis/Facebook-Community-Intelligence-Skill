# Facebook Community Intelligence Skill

A Windows-oriented Codex skill for discovering, validating, normalizing, and evaluating Facebook Groups around configurable **Subjects**. Subjects can be games, brands, products, apps, creators, companies, topics, events, competitors, franchises, or custom entities.

The public data model is:

```text
Subject ↔ Community ↔ Match
```

A Facebook Group is a first-class `Community`, stored once by canonical URL. Subject-specific relevance is represented separately as a `Match`, while validated group facts are stored as reusable evidence.

## Architecture upgrades

The mature Facebook collection pipeline is retained as the compatibility layer. The generalized intelligence layer adds Subject/Community/Match schema, automatic `games` migration, Subject-oriented discovery plans, canonical Community storage, evidence reuse, Community-centric JSON/XLSX output, optional flattened compatibility export, three demo datasets, golden regression, a 120-case synthetic benchmark, AI evaluation, run manifests, portfolio documentation, a structured `src/`/`tools/`/`benchmarks/` layout, CI benchmark regression, and a Facebook Groups source adapter.

Facebook Groups is the only implemented source. The adapter boundary is extensible, but this repository does not claim multi-platform collection.

## Install

```powershell
npm ci
npm run doctor
npm test
npm run login
npm run validate-login
```

## Generalized workflow

Copy `assets/subject_config.template.json` to a working config and define `subjects`.

```powershell
npm run intelligence -- --config .\subject_config.json --out-dir .\runs\example
```

Primary CLI terminology is `--subjects`. The older `--games` option and `games` config are still accepted for compatibility and are migrated automatically.

## Outputs

```text
normalized_subject_config.json
discovery_plan.json
subjects.json
communities.json
community_subject_matches.json
community_evidence.json
community_intelligence.xlsx
legacy_flattened.json
run_manifest.json
```

## Offline demos

```powershell
npm run demo
```

Demo datasets live under `demo/game`, `demo/brand`, and `demo/product`.

## Benchmark and evaluation

```powershell
npm run benchmark
npm run benchmark:check
npm run eval:ai
```

Bundled benchmark and AI-evaluation cases are **synthetic** regression fixtures. They are not production accuracy claims.

## Existing game-oriented workflow

Existing automation remains supported:

```powershell
npm run phase1 -- --games "Game A,Game B" --out-dir ".\runs\example" --config ".\task_config.json"
npm run phase15 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json" --out-dir ".\runs\example"
npm run phase2 -- --index ".\runs\example\phase1_index.json" --config ".\task_config.json"
npm run monitor
npm run monitor:bg
```

See `references/architecture.md`, `references/community_schema.md`, `references/benchmarking.md`, `references/ai_evaluation.md`, and `references/portfolio.md`.
