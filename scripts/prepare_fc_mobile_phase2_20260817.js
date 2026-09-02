'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'runs', 'game_phase1_phase15_20260803_2');
const runDir = path.join(root, 'runs', 'fc_mobile_phase2_v720_20260817');
const target = 'FC Mobile';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const sourceIndexFile = path.join(sourceDir, 'phase15_prefilter_index.json');
const sourceConfigFile = path.join(sourceDir, 'task_config.json');
const sourceIndex = readJson(sourceIndexFile);
const sourceConfig = readJson(sourceConfigFile);
const source = (sourceIndex.games || []).find((entry) => entry.game_name === target);
if (!source) throw new Error(`Missing Phase 1.5 entry: ${target}`);

const sourceFile = path.isAbsolute(source.candidates_file)
  ? source.candidates_file
  : path.resolve(sourceDir, source.candidates_file);
const candidates = readJson(sourceFile);
const candidatesDir = path.join(runDir, 'phase15_candidates');
const targetFile = path.join(candidatesDir, `001_${path.basename(sourceFile).replace(/^\d+_/, '')}`);
fs.mkdirSync(candidatesDir, { recursive: true });
fs.copyFileSync(sourceFile, targetFile);

const gameEntry = {
  ...source,
  candidates_file: targetFile,
  candidate_count: candidates.length,
  phase15_kept_count: candidates.length,
};

const index = {
  ...sourceIndex,
  created_at: new Date().toISOString(),
  mode: 'phase15_ordered_subset_for_phase2',
  source_phase15_index: sourceIndexFile,
  games: [gameEntry],
};

function selectGameMap(value) {
  const sourceValue = value && typeof value === 'object' ? value[target] : undefined;
  return { [target]: sourceValue ?? [] };
}

const config = {
  ...sourceConfig,
  games: [target],
  aliases: selectGameMap(sourceConfig.aliases),
  sibling_titles: selectGameMap(sourceConfig.sibling_titles),
  ip_roots: selectGameMap(sourceConfig.ip_roots),
  title_variant_overrides: selectGameMap(sourceConfig.title_variant_overrides),
  threshold: 10,
  phase2_auto_resume: true,
  phase2_name_prefilter: {
    enabled: true,
    allow_manual_review_candidates: true,
    treat_incomplete_as_inconclusive: true,
  },
  checkpoint_every_candidate: 1,
  progress_report_every_minutes: 10,
  allowed_language_signals: [],
  allowed_regions: [],
  cdp_url: 'http://127.0.0.1:9222',
  close_chrome_after_report: true,
  shutdown_after_complete: true,
  shutdown_mode: 'after_complete',
  snapshot_date: '2026-08-17',
  notes: {
    scope: 'FC Mobile Phase 2 from the existing Phase 1.5 queue only.',
    completion_action: 'After verified finalization, close Chrome and immediately shut down Windows.',
  },
};

if (config.semantic_region_resolver && typeof config.semantic_region_resolver === 'object') {
  config.semantic_region_resolver.cache_file = path.join(runDir, 'semantic_region_cache.json');
}
if (config.external_geocoder && typeof config.external_geocoder === 'object') {
  config.external_geocoder.cache_file = path.join(runDir, 'geocode_cache.json');
}

writeJson(path.join(runDir, 'phase15_prefilter_index.json'), index);
writeJson(path.join(runDir, 'task_config.json'), config);
writeJson(path.join(runDir, 'ordered_queue_manifest.json'), {
  generated_at: new Date().toISOString(),
  source_phase15_index: sourceIndexFile,
  order: [target],
  games: [{
    game_name: target,
    phase1_count: gameEntry.phase15_input_count,
    candidate_count: candidates.length,
    candidates_file: targetFile,
  }],
  total_candidates: candidates.length,
  completion_action: 'verified_shutdown_after_complete',
});

console.log(JSON.stringify({
  ok: true,
  run_dir: runDir,
  game_name: target,
  phase1_count: gameEntry.phase15_input_count,
  phase15_count: candidates.length,
  candidates_file: targetFile,
}, null, 2));
