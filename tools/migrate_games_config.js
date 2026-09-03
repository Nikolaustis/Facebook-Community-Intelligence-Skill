'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../src/config/load_config');
const { normalizeConfig } = require('../src/domain/schema');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('Usage: node tools/migrate_games_config.js --input task_config.json [--output subject_config.json]');
  process.exit(2);
}
const normalized = normalizeConfig(readJson(args.input));
const output = { subjects: normalized.subjects, ...normalized.runtime };
const outputFile = path.resolve(args.output || 'subject_config.json');
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(outputFile);
