'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { patchCollectorSource } = require('../scripts/collector_reliability_patcher');

const root = path.resolve(__dirname, '..');
const cases = [
  ['phase1', path.join(root, 'scripts', 'phase1_collect_candidates.js')],
  ['phase2', path.join(root, 'scripts', 'phase2_collect_details.js')],
];

for (const [mode, file] of cases) {
  assert(fs.existsSync(file), `missing collector source: ${file}`);
  const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const patched = patchCollectorSource(mode, source);
  assert(patched.length > source.length, `${mode} reliability patch did not add expected code`);
  if (mode === 'phase1') {
    assert(patched.includes("require('./facebook_metrics_parser')"));
    assert(patched.includes('function parseMemberCountLegacy('));
  } else {
    assert(patched.includes('card_size_unknown_forwarded_to_about'));
    assert(patched.includes('about && about.ok'));
    assert(patched.includes('parseGroupSize: extractGroupSize'));
  }
}

console.log('reliability contract against current collectors passed');
