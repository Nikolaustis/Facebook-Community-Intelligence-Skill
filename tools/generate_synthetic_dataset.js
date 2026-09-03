'use strict';

const fs = require('fs');
const path = require('path');
const current = path.resolve('benchmarks/synthetic_cases.json');
if (!fs.existsSync(current)) {
  console.error('Synthetic dataset is distributed with the repository; restore benchmarks/synthetic_cases.json.');
  process.exit(1);
}
const cases = JSON.parse(fs.readFileSync(current, 'utf8'));
console.log(JSON.stringify({ ok: true, cases: cases.length, file: current }, null, 2));
