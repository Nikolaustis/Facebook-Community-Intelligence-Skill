'use strict';

const assert = require('assert');
const fs = require('fs');
const { runBenchmark } = require('../tools/benchmark');

const cases = JSON.parse(fs.readFileSync('benchmarks/synthetic_cases.json', 'utf8'));
assert.strictEqual(cases.length, 120, 'synthetic benchmark must contain 120 cases');
const metrics = runBenchmark(cases);
assert(metrics.precision >= 0.95, `precision regression: ${metrics.precision}`);
assert(metrics.recall >= 0.95, `recall regression: ${metrics.recall}`);
assert(metrics.f1 >= 0.95, `f1 regression: ${metrics.f1}`);
assert(metrics.phase15_detail_request_reduction_rate > 0, 'benchmark must exercise prefilter reduction');
console.log(JSON.stringify(metrics));
