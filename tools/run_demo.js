'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const demos = ['game', 'brand', 'product'];
for (const name of demos) {
  const outDir = path.join('.demo-artifacts', name);
  const result = spawnSync(process.execPath, [
    path.resolve('scripts/run_community_intelligence.js'),
    '--config', path.join('demo', name, 'config.json'),
    '--rows', path.join('demo', name, 'rows.json'),
    '--out-dir', outDir,
    '--skip-collection',
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('offline demos passed');
