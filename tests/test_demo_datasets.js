'use strict';

const assert = require('assert');
const fs = require('fs');
const { normalizeConfig } = require('../src/domain/schema');
const { normalizeValidatedRow } = require('../src/sources/facebook_groups');

for (const demo of ['game', 'brand', 'product']) {
  const cfg = JSON.parse(fs.readFileSync(`demo/${demo}/config.json`, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(`demo/${demo}/rows.json`, 'utf8'));
  const normalized = normalizeConfig(cfg);
  assert(normalized.subjects.length >= 1, `${demo}: no subjects`);
  assert(rows.length >= 3, `${demo}: insufficient rows`);
  assert(rows.map(normalizeValidatedRow).every((row) => row.group_url), `${demo}: invalid group URL`);
}
console.log('demo dataset validation passed');
