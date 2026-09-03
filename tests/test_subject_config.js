'use strict';

const assert = require('assert');
const { normalizeConfig, toLegacyTaskConfig } = require('../src/domain/schema');

const legacy = normalizeConfig({
  games: ['Alpha Game'],
  aliases: { 'Alpha Game': ['AG'] },
  sibling_titles: { 'Alpha Game': ['Alpha Game Pro'] },
  threshold: 10,
});
assert.strictEqual(legacy.compatibility.migrated_from_games, true);
assert.strictEqual(legacy.subjects[0].subject_type, 'game');
assert.deepStrictEqual(legacy.subjects[0].aliases, ['AG']);

const generalized = normalizeConfig({
  subjects: [{ name: 'Acme', type: 'brand', aliases: ['ACME Brand'] }],
  threshold: 20,
});
assert.strictEqual(generalized.compatibility.migrated_from_games, false);
assert.strictEqual(generalized.subjects[0].subject_type, 'brand');

const compat = toLegacyTaskConfig(generalized);
assert.deepStrictEqual(compat.games, ['Acme']);
assert.strictEqual(compat.threshold, 20);
console.log('subject config compatibility checks passed');
