'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'runs', 'game_phase1_phase15_20260803_2');
const runDir = path.join(root, 'runs', 'cookie_line_phase2_until_20260814_0000');
const targets = ['CookieRun Classic', 'CookieRun Kingdom', 'LINE Idle Rangers', 'LINE Rangers'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const sourceIndex = readJson(path.join(sourceDir, 'phase15_prefilter_index.json'));
const sourceConfig = readJson(path.join(sourceDir, 'task_config.json'));
const sourceByGame = new Map((sourceIndex.games || []).map((entry) => [entry.game_name, entry]));
const outCandidatesDir = path.join(runDir, 'phase15_candidates');
fs.mkdirSync(outCandidatesDir, { recursive: true });

const games = targets.map((gameName, index) => {
  const source = sourceByGame.get(gameName);
  if (!source) throw new Error(`Missing Phase 1.5 entry: ${gameName}`);
  const sourceFile = path.isAbsolute(source.candidates_file)
    ? source.candidates_file
    : path.resolve(sourceDir, source.candidates_file);
  const rows = readJson(sourceFile);
  const fileName = `${String(index + 1).padStart(3, '0')}_${path.basename(sourceFile).replace(/^\d+_/, '')}`;
  const targetFile = path.join(outCandidatesDir, fileName);
  fs.copyFileSync(sourceFile, targetFile);
  return {
    ...source,
    candidates_file: targetFile,
    candidate_count: rows.length,
    phase15_kept_count: rows.length,
  };
});

const index = {
  ...sourceIndex,
  created_at: new Date().toISOString(),
  mode: 'phase15_ordered_subset_for_phase2',
  source_phase15_index: path.join(sourceDir, 'phase15_prefilter_index.json'),
  games,
};

const pickMap = (value) => Object.fromEntries(targets.map((game) => [game, (value || {})[game] ?? (Array.isArray((value || {})[game]) ? [] : {})]));
const config = {
  ...sourceConfig,
  games: targets,
  aliases: pickMap(sourceConfig.aliases),
  sibling_titles: pickMap(sourceConfig.sibling_titles),
  ip_roots: pickMap(sourceConfig.ip_roots),
  title_variant_overrides: pickMap(sourceConfig.title_variant_overrides),
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
  shutdown_after_complete: false,
  shutdown_mode: 'none',
  snapshot_date: '2026-08-13',
  notes: {
    scope: 'Ordered Phase 2 from existing Phase 1.5 only: CookieRun Classic, CookieRun Kingdom, LINE Idle Rangers, LINE Rangers.',
    deadline_pause: 'At 2026-08-14 00:00 Asia/Shanghai, wait for the in-flight candidate full checkpoint, stop, close Chrome, and shut down Windows.',
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
  source_phase15_index: index.source_phase15_index,
  order: targets,
  games: games.map((entry) => ({
    game_name: entry.game_name,
    candidate_count: entry.candidate_count,
    candidates_file: entry.candidates_file,
  })),
  total_candidates: games.reduce((sum, entry) => sum + entry.candidate_count, 0),
  deadline: '2026-08-14T00:00:00+08:00',
});

console.log(JSON.stringify({
  ok: true,
  run_dir: runDir,
  order: targets,
  counts: games.map((entry) => [entry.game_name, entry.candidate_count]),
  total_candidates: games.reduce((sum, entry) => sum + entry.candidate_count, 0),
}, null, 2));

