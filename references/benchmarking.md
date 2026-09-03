# Benchmarking

The repository includes a deterministic **synthetic** benchmark for regression detection, not production-quality claims.

`benchmarks/synthetic_cases.json` contains 120 labeled relevance cases covering canonical names, aliases, mixed scripts, and mutually-exclusive sibling labels.

```powershell
npm run benchmark
npm run benchmark:check
```

Reported fields include precision, recall, F1, candidate recall, manual-review rate, and synthetic Phase 1.5 detail-request reduction.

Do not present these synthetic values as production metrics.
