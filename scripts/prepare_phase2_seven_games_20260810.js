const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceRun = path.join(root, 'runs', 'game_phase1_phase15_20260803');
const outDir = path.join(root, 'runs', 'phase2_seven_games_20260810');
const sourceIndexFile = path.join(sourceRun, 'phase1_index_corrected.json');
const sourceConfigFile = path.join(sourceRun, 'task_phase15_config.json');
const selectedNames = [
  'ArcheAge War',
  'Ghost Soul M',
  'LORDNINE: Infinite Class',
  'MU MAX Age: THE AWAKENING',
  'Seal M on CROSS',
  'Tree of Savior M: Extreme',
  'Zeus: God of Pride',
];

const sourceIndex = JSON.parse(fs.readFileSync(sourceIndexFile, 'utf8'));
const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigFile, 'utf8'));
const byName = new Map(sourceIndex.games.map((game) => [game.game_name, game]));
const games = selectedNames.map((name) => {
  const game = byName.get(name);
  if (!game) throw new Error(`Missing source Phase 1 game: ${name}`);
  if (!fs.existsSync(path.resolve(game.candidates_file))) {
    throw new Error(`Missing source candidate file for ${name}: ${game.candidates_file}`);
  }
  return game;
});

fs.mkdirSync(outDir, { recursive: true });
const index = {
  ...sourceIndex,
  created_at: new Date().toISOString(),
  mode: 'phase1_subset_for_phase2',
  source_phase1_index: sourceIndexFile,
  out_dir: outDir,
  games,
};

const selectObjectKeys = (source) => Object.fromEntries(
  selectedNames.filter((name) => Object.prototype.hasOwnProperty.call(source || {}, name))
    .map((name) => [name, source[name]]),
);

const config = {
  games: selectedNames,
  aliases: selectObjectKeys(sourceConfig.aliases),
  sibling_titles: selectObjectKeys(sourceConfig.sibling_titles),
  ip_roots: selectObjectKeys(sourceConfig.ip_roots),
  title_variant_overrides: selectObjectKeys(sourceConfig.title_variant_overrides),
  threshold: 10,
  phase2_auto_resume: true,
  phase15_name_prefilter: {
    enabled: true,
    reuse_cache: true,
    keep_missing_or_truncated_names: true,
    keep_ip_root_only: false,
    keep_sibling_only_for_manual_review: false,
    use_source_queries: false,
    minimum_query_compact_length: 3,
    write_rejected_candidates: true,
    write_review_candidates: true,
    max_examples_per_reason: 20,
  },
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
  snapshot_date: '2026-08-10',
  semantic_region_resolver: {
    enabled: 'auto',
    provider_order: ['custom_api', 'codex_exec', 'rules_only'],
    local_config_file: 'config/local/semantic_model.local.json',
    trigger_mode: 'risk_only',
    confidence_threshold: 0.85,
    max_calls_per_run: 1200,
    fallback_on_low_confidence: true,
    allow_model_explicit_region_lock: true,
    fail_closed_on_low_confidence: true,
    fail_closed_on_error: true,
    cache_file: path.join(outDir, 'semantic_region_cache.json'),
  },
  external_geocoder: {
    enabled: true,
    provider: 'geonames',
    local_config_file: 'config/local/geonames.local.json',
    username_env: 'GEONAMES_USERNAME',
    only_when_region_empty: true,
    sources: ['group_name', 'about_location'],
    max_queries_per_group: 4,
    max_rows: 5,
    min_confidence: 0.75,
    ambiguity_margin: 0.04,
    timeout_ms: 8000,
    rate_limit_ms: 1200,
    retry_attempts: 2,
    retry_delay_ms: 1500,
    cache_file: path.join(outDir, 'geocode_cache.json'),
    endpoint: 'http://api.geonames.org/searchJSON',
    group_name_single_token_min_population: 50000,
  },
};

fs.writeFileSync(path.join(outDir, 'phase1_index.json'), JSON.stringify(index, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'task_config.json'), JSON.stringify(config, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'selected_games.json'), JSON.stringify(selectedNames, null, 2), 'utf8');
process.stdout.write(`${JSON.stringify({ out_dir: outDir, games: games.length, phase1_candidates: games.reduce((sum, game) => sum + Number(game.candidates_count || 0), 0) }, null, 2)}\n`);
