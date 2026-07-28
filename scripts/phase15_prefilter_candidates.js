const fs = require('fs');
const path = require('path');
const { readJsonFile } = require('./json_io');
const { preparePhase15Index } = require('./name_relevance_prefilter');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else { out[key] = next; i++; }
  }
  return out;
}

function boolLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

(function main() {
  const args = parseArgs(process.argv.slice(2));
  const indexFile = path.resolve(args.index || '');
  if (!indexFile || !fs.existsSync(indexFile)) {
    process.stderr.write('Usage: node phase15_prefilter_candidates.js --index "<phase1_index.json>" [--config "<task_config.json>"]\n');
    process.exit(2);
  }
  const configFile = args.config ? path.resolve(args.config) : '';
  const config = configFile && fs.existsSync(configFile) ? readJsonFile(configFile) : {};
  const outDir = path.resolve(args['out-dir'] || path.dirname(indexFile));
  const progressFile = path.resolve(args['out-progress'] || path.join(outDir, 'phase15_name_prefilter_progress.json'));
  const result = preparePhase15Index({
    indexFile,
    config,
    outDir,
    progressFile,
    force: boolLike(args.force, false),
    overrides: {
      enabled: args.enabled === undefined ? undefined : boolLike(args.enabled, true),
    },
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: '7.0.0',
    enabled: result.enabled,
    cache_hit: result.cache_hit,
    filtered_index_file: result.index_file,
    audit_file: result.audit_file || '',
    input_candidates: result.audit && result.audit.input_candidates,
    kept_candidates: result.audit && result.audit.kept_candidates,
    rejected_candidates: result.audit && result.audit.rejected_candidates,
    reduction_rate: result.audit && result.audit.reduction_rate,
  }, null, 2)}\n`);
})();
