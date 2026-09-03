'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { patchCollectorSource } = require('../scripts/collector_reliability_patcher');

assert.strictEqual(pkg.version, '8.0.0', 'package.json must advertise V8.0.0');

const skill = fs.readFileSync(path.resolve(__dirname, '..', 'SKILL.md'), 'utf8');
assert(/(?:^|\n)version:\s*8\.0\.0(?:\r?\n|$)/.test(skill), 'SKILL.md frontmatter must advertise V8.0.0');

const phase1File = path.resolve(__dirname, '..', 'scripts', 'phase1_collect_candidates.js');
if (fs.existsSync(phase1File)) {
  const source = fs.readFileSync(phase1File, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const patched = patchCollectorSource('phase1', source);
  assert(patched.includes("    version: '8.0.0',"), 'Phase 1 diagnostics must emit V8.0.0');
  assert(patched.includes("      skill_version: '8.0.0',"), 'phase1_index must emit V8.0.0');
}

console.log('V8.0.0 release version contract passed');
