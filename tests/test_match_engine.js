'use strict';

const assert = require('assert');
const fs = require('fs');
const { evaluateCommunitySubject, containsPhrase } = require('../src/intelligence/match_engine');

assert(containsPhrase('Sailor Piece水手寶石中文交易討論區', 'Sailor Piece'));
assert(!containsPhrase('Sailor Pieces', 'Sailor Piece'));
assert(containsPhrase('GAG中文交易群', 'GAG'));
assert(!containsPhrase('GAG2', 'GAG'));

const cases = JSON.parse(fs.readFileSync('benchmarks/golden_cases.json', 'utf8'));
for (const item of cases) {
  const actual = evaluateCommunitySubject(item.input, item.subject);
  assert.strictEqual(actual.status, item.expected_status, `${item.case_id}: ${JSON.stringify(actual)}`);
  if (item.expected_match_type) {
    assert.strictEqual(actual.match_type, item.expected_match_type, item.case_id);
  }
}
console.log(`golden match regression passed (${cases.length} cases)`);
