'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'phase1_collect_candidates.js'), 'utf8');
const checks = [
  ['primary search route', '/search/groups/'],
  ['fallback groups route', '/groups/search/groups/'],
  ['zero-result diagnostics', 'phase1_diagnostics'],
  ['diagnostic screenshot', 'page.screenshot'],
  ['high-recall token audit', 'phase1_query_token_match'],
  ['name extraction source', 'phase1_name_source'],
  ['raw name audit', 'phase1_name_raw'],
  ['name normalization audit', 'phase1_name_normalization'],
  ['name score audit', 'phase1_name_score'],
  ['search readiness wait', 'waitForSearchSurface'],
  ['nested scroll recovery', 'scrollSearchSurface'],
  ['shared group-name scoring', 'chooseBestNameCandidate'],
  ['avatar-label sanitizer', 'sanitizeGroupName'],
];

for (const [label, needle] of checks) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

if (/if \(queryTokens\.length && !queryTokens\.some\([^\n]+\)\) continue;/.test(source)) {
  throw new Error('Legacy Phase 1 hard query-token rejection is still present.');
}

console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));
