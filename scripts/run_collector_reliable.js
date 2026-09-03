'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { patchCollectorSource } = require('./collector_reliability_patcher');

function usage() {
  console.error('Usage: node scripts/run_collector_reliable.js <phase1|phase2> [collector args...]');
}

function cleanup(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_err) {
    // A stale runtime file is ignored by git and can be removed on the next run.
  }
}

function main() {
  const argv = process.argv.slice(2);
  const mode = String(argv.shift() || '').trim().toLowerCase();
  if (!['phase1', 'phase2'].includes(mode)) {
    usage();
    process.exit(2);
  }

  const scriptsDir = __dirname;
  const originalFile = path.join(
    scriptsDir,
    mode === 'phase1' ? 'phase1_collect_candidates.js' : 'phase2_collect_details.js',
  );
  if (!fs.existsSync(originalFile)) {
    throw new Error(`Collector source not found: ${originalFile}`);
  }

  const source = fs.readFileSync(originalFile, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const patched = patchCollectorSource(mode, source);
  const runtimeFile = path.join(
    scriptsDir,
    `.__runtime_${mode}_${process.pid}_${Date.now()}.js`,
  );
  fs.writeFileSync(runtimeFile, patched, 'utf8');

  const child = spawn(process.execPath, [runtimeFile, ...argv], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });

  let forwarded = false;
  const forwardSignal = (signal) => {
    if (forwarded) return;
    forwarded = true;
    try { child.kill(signal); } catch (_err) { /* ignore */ }
  };
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', (err) => {
    cleanup(runtimeFile);
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    cleanup(runtimeFile);
    if (signal) {
      console.error(`[reliability-runner] collector exited by signal ${signal}`);
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
    process.exit(Number.isInteger(code) ? code : 1);
  });
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
