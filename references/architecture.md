# Architecture

```text
Subject Configuration
        ↓
Discovery Plan
        ↓
Facebook Groups Adapter
        ↓
Community Store
        ↓
Evidence Store
        ↓
Match Engine
        ↓
Community-centric Export
        ↓
Benchmark / Evaluation / Run Manifest
```

## Compatibility boundary
The mature Facebook collectors remain in `scripts/`. The generalized layer converts Subject configuration to the legacy collector contract at runtime. Existing `games` configuration is accepted and migrated in memory.

## Source boundary
`src/sources/facebook_groups.js` is the only implemented source adapter. The project does not claim multi-platform collection.
