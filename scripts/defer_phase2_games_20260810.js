'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonFile, writeJsonAtomic } = require('./json_io');

const root = path.resolve(__dirname, '..');
const runDir = path.join(root, 'runs', 'phase2_sixteen_games_20260810');
const indexFile = path.join(runDir, 'phase15_prefilter_index.json');
const configFile = path.join(runDir, 'task_config.json');

const deferredNames = [
  'Night Crows',
  'ODIN: Valhalla Rising',
  'Ran Mobile: The Master Class',
  'RF Online Next',
  'Real Yulgang Classic',
  'Yulgang:ยุทธภพสนุก',
  'Yulgangจุติยุทธภพเลือดใหม่',
];
const deferredSet = new Set(deferredNames);

function pickGameMap(source, names) {
  const out = {};
  for (const name of names) out[name] = Array.isArray(source && source[name]) ? source[name] : [];
  return out;
}

const fullIndex = readJsonFile(indexFile);
const fullConfig = readJsonFile(configFile);
const byName = new Map(fullIndex.games.map((entry) => [entry.game_name, entry]));
const missing = deferredNames.filter((name) => !byName.has(name));
if (missing.length) throw new Error(`Deferred games missing from Phase 1.5 index: ${missing.join(', ')}`);

const currentGames = fullIndex.games.filter((entry) => !deferredSet.has(entry.game_name));
const deferredGames = deferredNames.map((name) => byName.get(name));
const currentNames = currentGames.map((entry) => entry.game_name);
const now = new Date().toISOString();

const allBackup = path.join(runDir, 'phase15_prefilter_index_all_16_before_defer.json');
if (!fs.existsSync(allBackup)) writeJsonAtomic(allBackup, fullIndex);

const currentIndex = {
  ...fullIndex,
  created_at: now,
  games: currentGames,
  config_file: configFile,
  scope_note: 'Current Phase 2 scope reduced by user on 2026-08-10; seven games deferred to the next run.',
  deferred_index: path.join(runDir, 'phase15_prefilter_index_deferred_next_run.json'),
};

const deferredConfigFile = path.join(runDir, 'task_config_deferred_next_run.json');
const deferredIndex = {
  ...fullIndex,
  created_at: now,
  games: deferredGames,
  config_file: deferredConfigFile,
  scope_note: 'Preserved Phase 1.5 candidates for the seven games deferred by the user on 2026-08-10.',
  source_current_run: runDir,
};

const currentConfig = {
  ...fullConfig,
  games: currentNames,
  aliases: pickGameMap(fullConfig.aliases, currentNames),
  sibling_titles: pickGameMap(fullConfig.sibling_titles, currentNames),
  ip_roots: pickGameMap(fullConfig.ip_roots, currentNames),
};

const deferredConfig = {
  ...fullConfig,
  games: deferredNames,
  aliases: pickGameMap(fullConfig.aliases, deferredNames),
  sibling_titles: pickGameMap(fullConfig.sibling_titles, deferredNames),
  ip_roots: pickGameMap(fullConfig.ip_roots, deferredNames),
  shutdown_after_complete: false,
  shutdown_mode: 'none',
  shutdown_delay_seconds: 60,
  notes: {
    ...(fullConfig.notes || {}),
    deferred_scope: 'Seven games preserved for a future Phase 2 run; launch only on a new user instruction.',
  },
};

const manifest = {
  manifest_kind: 'facebook_group_monitor_phase2_deferred_games',
  created_at: now,
  source_run: runDir,
  current_games: currentNames,
  current_candidate_count: currentGames.reduce((sum, entry) => sum + Number(entry.candidate_count || entry.candidates_count || 0), 0),
  deferred_games: deferredNames,
  deferred_candidate_count: deferredGames.reduce((sum, entry) => sum + Number(entry.candidate_count || entry.candidates_count || 0), 0),
  deferred_index: path.join(runDir, 'phase15_prefilter_index_deferred_next_run.json'),
  deferred_config: deferredConfigFile,
  preservation: 'Original corrected Phase 1.5 candidate files are referenced without modification.',
};

writeJsonAtomic(indexFile, currentIndex);
writeJsonAtomic(configFile, currentConfig);
writeJsonAtomic(path.join(runDir, 'selected_games.json'), currentNames);
writeJsonAtomic(path.join(runDir, 'phase15_prefilter_index_deferred_next_run.json'), deferredIndex);
writeJsonAtomic(deferredConfigFile, deferredConfig);
writeJsonAtomic(path.join(runDir, 'deferred_games_next_run.json'), manifest);

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
