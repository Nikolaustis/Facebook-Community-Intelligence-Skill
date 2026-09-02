'use strict';

const path = require('path');
const { readJsonFile, writeJsonAtomic } = require('./json_io');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'runs', 'phase2_sixteen_games_20260810');
const runDir = path.join(root, 'runs', 'phase2_deferred_seven_games_20260811');
const sourceIndexFile = path.join(sourceDir, 'phase15_prefilter_index_deferred_next_run.json');
const sourceConfigFile = path.join(sourceDir, 'task_config_deferred_next_run.json');
const indexFile = path.join(runDir, 'phase15_prefilter_index.json');
const configFile = path.join(runDir, 'task_config.json');

const expectedGames = [
  'Night Crows',
  'ODIN: Valhalla Rising',
  'Ran Mobile: The Master Class',
  'RF Online Next',
  'Real Yulgang Classic',
  'Yulgang:ยุทธภพสนุก',
  'Yulgangจุติยุทธภพเลือดใหม่',
];

const sourceIndex = readJsonFile(sourceIndexFile);
const sourceConfig = readJsonFile(sourceConfigFile);
const actualGames = sourceIndex.games.map((entry) => entry.game_name);
if (JSON.stringify(actualGames) !== JSON.stringify(expectedGames)) {
  throw new Error(`Deferred index order mismatch: ${JSON.stringify(actualGames)}`);
}

const rfAliases = sourceConfig.aliases?.['RF Online Next'] || [];
const rfRoots = sourceConfig.ip_roots?.['RF Online Next'] || [];
const rfVariants = sourceConfig.title_variant_overrides?.['RF Online Next'] || [];
if (rfAliases.length || rfRoots.length || rfVariants.length) {
  throw new Error('RF Online Next must use the complete title only in Phase 2.');
}

const yulgangGames = expectedGames.filter((name) => name === 'Real Yulgang Classic' || name.startsWith('Yulgang'));
for (const game of yulgangGames) {
  const siblings = new Set(sourceConfig.sibling_titles?.[game] || []);
  const missing = yulgangGames.filter((other) => other !== game && !siblings.has(other));
  if (missing.length) throw new Error(`Yulgang sibling exclusion incomplete for ${game}: ${missing.join(', ')}`);
}

const index = {
  ...sourceIndex,
  created_at: new Date().toISOString(),
  games: sourceIndex.games,
  out_dir: runDir,
  config_file: configFile,
  source_deferred_index: sourceIndexFile,
  scope_note: 'Seven games explicitly resumed by the user for Phase 2 on 2026-08-11.',
};

const config = {
  ...sourceConfig,
  games: expectedGames,
  close_chrome_after_report: true,
  shutdown_after_complete: true,
  shutdown_mode: 'after_complete',
  shutdown_delay_seconds: 0,
  snapshot_date: '2026-08-11',
  semantic_region_resolver: {
    ...sourceConfig.semantic_region_resolver,
    cache_file: path.join(runDir, 'semantic_region_cache.json'),
  },
  external_geocoder: {
    ...sourceConfig.external_geocoder,
    cache_file: path.join(runDir, 'geocode_cache.json'),
  },
  notes: {
    ...(sourceConfig.notes || {}),
    current_scope: 'Seven games deferred on 2026-08-10 and explicitly launched on 2026-08-11.',
    rf_online_next: 'Phase 2 uses only the complete title RF Online Next; RF Online is not an alias, IP root, or title variant.',
    yulgang_sibling_exclusion: 'All three Yulgang games are mutually exclusive through canonical titles and configured aliases.',
  },
};

const manifest = {
  manifest_kind: 'facebook_group_monitor_phase2_deferred_seven_launch',
  created_at: new Date().toISOString(),
  games: expectedGames,
  total_candidates: index.games.reduce((sum, entry) => sum + Number(entry.candidate_count || entry.candidates_count || 0), 0),
  source_index: sourceIndexFile,
  index_file: indexFile,
  config_file: configFile,
  rf_online_next_full_title_only: true,
  yulgang_mutual_exclusion_verified: true,
  shutdown_after_verified_completion: true,
  shutdown_delay_seconds: 0,
};

writeJsonAtomic(indexFile, index);
writeJsonAtomic(configFile, config);
writeJsonAtomic(path.join(runDir, 'selected_games.json'), expectedGames);
writeJsonAtomic(path.join(runDir, 'launch_manifest.json'), manifest);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
