const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'phase1_collect_candidates.js'), 'utf8');
const checks = [
  ['dual search route', 'groups/search/groups_home'],
  ['raw group-link probe', 'raw_group_link_count'],
  ['zero-result diagnostics', 'phase1_diagnostics'],
  ['diagnostic screenshot', 'page.screenshot'],
  ['high-recall token audit', 'phase1_query_token_match'],
  ['name extraction source', 'phase1_name_source'],
  ['search readiness wait', 'waitForSearchResultsReady'],
  ['nested scroll recovery', 'scrollSearchResults'],
  ['explicit zero stop reason', 'ZERO_CANDIDATES_AFTER_ROUTE_FALLBACK'],
  ['checkpoint distinction', 'LOGIN_OR_CHECKPOINT_SIGNAL'],
];

for (const [label, needle] of checks) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

if (/if \(queryTokens\.length && !queryTokens\.some\([^\n]+\)\) continue;/.test(source)) {
  throw new Error('Legacy Phase 1 hard query-token rejection is still present.');
}

console.log(JSON.stringify({ ok: true, checks: checks.length, version: '7.0.1' }, null, 2));
