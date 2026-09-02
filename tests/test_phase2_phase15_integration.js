'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'phase2_collect_details.js'), 'utf8');
const importPos = source.indexOf("require('./name_relevance_prefilter')");
const phase15Pos = source.indexOf('preparePhase15Index({');
const activeIndexPos = source.indexOf('const activeIndex = phase15Result.index || index;');
const browserPos = source.indexOf('chromium.connectOverCDP');

assert(importPos >= 0, 'Phase 2 must import the authoritative Phase 1.5 implementation.');
assert(phase15Pos >= 0, 'Phase 2 must run Phase 1.5 automatically.');
assert(activeIndexPos > phase15Pos, 'Phase 2 must consume the reduced Phase 1.5 index.');
assert(browserPos > activeIndexPos, 'Phase 1.5 must complete before connecting to Facebook.');
assert(source.includes('choosePhase2GroupName'), 'Phase 2 must use cleaned About/Phase 1 name selection.');
assert(source.includes('sanitizeGroupName'), 'Phase 2 must sanitize group names before downstream classification.');

console.log(JSON.stringify({ ok: true, checks: 6 }, null, 2));
