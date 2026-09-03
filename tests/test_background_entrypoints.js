'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(repo, relativePath);

  assert(
    fs.existsSync(fullPath),
    `Required file does not exist: ${relativePath}`,
  );

  return fs.readFileSync(fullPath, 'utf8');
}

function assertFileExists(relativePath) {
  assert(
    fs.existsSync(path.join(repo, relativePath)),
    `Required entrypoint does not exist: ${relativePath}`,
  );
}

// ---------------------------------------------------------------------------
// Required stable entrypoints
// ---------------------------------------------------------------------------

assertFileExists('scripts/run_multi_games_reliable.ps1');
assertFileExists('scripts/start_background_reliable.ps1');
assertFileExists('scripts/start_background_task.ps1');

// ---------------------------------------------------------------------------
// package.json contracts
// ---------------------------------------------------------------------------

const pkg = JSON.parse(read('package.json'));

assert.strictEqual(
  pkg.scripts.monitor,
  'powershell -ExecutionPolicy Bypass -File .\\scripts\\run_multi_games_reliable.ps1',
  'npm run monitor must use the stable reliable monitor entrypoint',
);

assert.strictEqual(
  pkg.scripts['monitor:bg'],
  'powershell -ExecutionPolicy Bypass -File .\\scripts\\start_background_reliable.ps1 -Task monitor',
  'npm run monitor:bg must use the reliable background wrapper',
);

// ---------------------------------------------------------------------------
// Background monitor dependency contract
// ---------------------------------------------------------------------------

const backgroundTask = read('scripts/start_background_task.ps1');

assert(
  backgroundTask.includes(
    'Join-Path $RootDir "scripts\\run_multi_games_reliable.ps1"',
  ),
  'start_background_task.ps1 monitor mode must invoke run_multi_games_reliable.ps1',
);

assert(
  !backgroundTask.includes('run_multi_games_v2.ps1'),
  'start_background_task.ps1 must not reference the removed legacy monitor entrypoint',
);

// ---------------------------------------------------------------------------
// Reliable wrapper contract
// ---------------------------------------------------------------------------

const backgroundWrapper = read('scripts/start_background_reliable.ps1');

assert(
  backgroundWrapper.includes("'start_background_task.ps1'"),
  'reliable background wrapper must source start_background_task.ps1',
);

assert(
  backgroundWrapper.includes('run_collector_reliable.js'),
  'reliable background wrapper must patch collectors to the reliable runner',
);

assert(
  backgroundWrapper.includes('scheduled_phase2_runner_reliable.ps1'),
  'reliable background wrapper must use the reliable scheduled Phase 2 runner',
);

console.log('background entrypoint contract checks passed');
