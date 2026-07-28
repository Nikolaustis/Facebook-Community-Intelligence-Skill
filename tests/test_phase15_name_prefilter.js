const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildProfiles, evaluateCandidate, mergeOptions } = require('../scripts/name_relevance_prefilter');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'phase15_name_prefilter_cases.json'), 'utf8'));
const gameNames = Array.from(new Set(cases.map((item) => item.game_name)));
const gameEntries = gameNames.map((game_name) => ({ game_name, candidates_file: '' }));
const config = {
  aliases: {
    'Grow a Garden': ['GAG', 'GAG1'],
    'Grow a Garden 2': ['GAG2'],
  },
  title_variant_overrides: {},
  ip_roots: {},
  sibling_titles: {},
  phase15_name_prefilter: {
    enabled: true,
    keep_missing_or_truncated_names: true,
    keep_ip_root_only: false,
    keep_sibling_only_for_manual_review: false,
    use_source_queries: true,
  },
};
const profiles = buildProfiles(gameEntries, config);
const options = mergeOptions(config);
assert.strictEqual(mergeOptions({ phase15_name_prefilter: { enabled: false } }, { enabled: undefined }).enabled, false, 'undefined CLI override must not re-enable a disabled config');
assert.strictEqual(mergeOptions({ phase15_name_prefilter: { keep_ip_root_only: true } }, {}).keep_ip_root_only, true, 'config options must be preserved');

for (const testCase of cases) {
  const candidate = {
    group_name: testCase.group_name,
    group_url: `https://example.invalid/${encodeURIComponent(testCase.name)}`,
    source_query: testCase.source_query || testCase.game_name,
    source_queries: testCase.source_queries || [],
    source_is_seed_url: Boolean(testCase.source_is_seed_url),
  };
  const result = evaluateCandidate(testCase.game_name, candidate, profiles, options);
  assert.strictEqual(result.keep, testCase.expected_keep, `${testCase.name}: ${JSON.stringify(result)}`);
  if (testCase.expected_reason) assert.strictEqual(result.reason, testCase.expected_reason, testCase.name);
  if (testCase.expected_decision) assert.strictEqual(result.decision, testCase.expected_decision, testCase.name);
}

process.stdout.write(JSON.stringify({ ok: true, cases: cases.length }, null, 2) + '\n');
