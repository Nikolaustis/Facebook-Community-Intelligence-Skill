const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceRun = path.join(root, 'runs', 'game_phase1_phase15_20260803');
const sourcePhase15Dir = path.join(sourceRun, 'corrected_phase15');
const sourceIndexFile = path.join(sourcePhase15Dir, 'phase15_prefilter_index.json');
const sourceConfigFile = path.join(sourceRun, 'task_phase15_config.json');
const outDir = path.join(root, 'runs', 'phase2_sixteen_games_20260810');

const selectedNames = [
  'Legend of Ymir',
  'Lineage W',
  'Lineage2M',
  'Night Crows',
  'ODIN: Valhalla Rising',
  'Ragnarok M Eternal Love',
  'Ragnarok M: Classic',
  'Ragnarok Origin Classic',
  'Ragnarok X: Next Generation',
  'Ragnarok: Midgard Senki',
  'Ragnarok: The New World',
  'Ran Mobile: The Master Class',
  'RF Online Next',
  'Real Yulgang Classic',
  'Yulgang:ยุทธภพสนุก',
  'Yulgangจุติยุทธภพเลือดใหม่',
];

const sourceIndex = JSON.parse(fs.readFileSync(sourceIndexFile, 'utf8'));
const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigFile, 'utf8'));
const sourceByName = new Map(sourceIndex.games.map((game) => [game.game_name, game]));

const games = selectedNames.map((name) => {
  const sourceGame = sourceByName.get(name);
  if (!sourceGame) throw new Error(`Missing Phase 1.5 game: ${name}`);
  const sourceCandidateFile = path.isAbsolute(sourceGame.candidates_file)
    ? path.normalize(sourceGame.candidates_file)
    : path.resolve(sourcePhase15Dir, sourceGame.candidates_file);
  if (!fs.existsSync(sourceCandidateFile)) {
    throw new Error(`Missing Phase 1.5 candidate file for ${name}: ${sourceCandidateFile}`);
  }
  const rows = JSON.parse(fs.readFileSync(sourceCandidateFile, 'utf8'));
  return {
    ...sourceGame,
    candidates_file: sourceCandidateFile,
    candidate_count: rows.length,
    candidates_count: rows.length,
    phase15_kept_count: rows.length,
  };
});

const selectObjectKeys = (source) => Object.fromEntries(
  selectedNames.filter((name) => Object.prototype.hasOwnProperty.call(source || {}, name))
    .map((name) => [name, source[name]]),
);

const aliases = selectObjectKeys(sourceConfig.aliases);
const ragnarokGames = selectedNames.filter((name) => name.startsWith('Ragnarok'));
const yulgangGames = [
  'Real Yulgang Classic',
  'Yulgang:ยุทธภพสนุก',
  'Yulgangจุติยุทธภพเลือดใหม่',
];

const siblingTitles = Object.fromEntries(selectedNames.map((name) => [name, []]));
for (const name of ragnarokGames) {
  siblingTitles[name] = ragnarokGames.filter((other) => other !== name);
}
for (const name of yulgangGames) {
  siblingTitles[name] = yulgangGames.filter((other) => other !== name);
}
siblingTitles['Lineage W'] = ['Lineage2M'];
siblingTitles.Lineage2M = ['Lineage W'];

const index = {
  ...sourceIndex,
  created_at: new Date().toISOString(),
  mode: 'phase15_subset_for_phase2',
  source_phase15_index: sourceIndexFile,
  out_dir: outDir,
  games,
};

const config = {
  games: selectedNames,
  aliases,
  sibling_titles: siblingTitles,
  ip_roots: Object.fromEntries(selectedNames.map((name) => [name, []])),
  title_variant_overrides: {},
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
  snapshot_date: '2026-08-10',
  notes: {
    ragnarok_sibling_exclusion: 'All six selected Ragnarok games are mutually exclusive through canonical titles and configured multilingual aliases.',
    yulgang_sibling_exclusion: 'Real Yulgang Classic and both Thai Yulgang titles are mutually exclusive through canonical titles and configured aliases.',
    lineage_sibling_exclusion: 'Lineage W and Lineage2M are mutually exclusive.',
    rf_online_next: 'Phase 2 requires the complete title RF Online Next; RF Online is not an alias, IP root, or configured title variant.',
  },
  semantic_region_resolver: {
    enabled: 'auto',
    provider_order: ['custom_api', 'codex_exec', 'rules_only'],
    local_config_file: 'config/local/semantic_model.local.json',
    trigger_mode: 'risk_only',
    confidence_threshold: 0.85,
    max_calls_per_run: 4000,
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

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'phase15_prefilter_index.json'), JSON.stringify(index, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'task_config.json'), JSON.stringify(config, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'selected_games.json'), JSON.stringify(selectedNames, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'sibling_exclusion_manifest.json'), JSON.stringify({
  ragnarok: Object.fromEntries(ragnarokGames.map((name) => [name, siblingTitles[name]])),
  yulgang: Object.fromEntries(yulgangGames.map((name) => [name, siblingTitles[name]])),
  lineage: { 'Lineage W': siblingTitles['Lineage W'], Lineage2M: siblingTitles.Lineage2M },
  rf_online_next_full_title_only: true,
}, null, 2), 'utf8');

process.stdout.write(`${JSON.stringify({
  out_dir: outDir,
  games: games.length,
  phase15_candidates: games.reduce((sum, game) => sum + Number(game.candidate_count || 0), 0),
  per_game: games.map((game) => ({ game_name: game.game_name, candidate_count: game.candidate_count })),
}, null, 2)}\n`);
