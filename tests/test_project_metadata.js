'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
const skill = fs.readFileSync(path.join(repo, 'SKILL.md'), 'utf8');
const phase1 = fs.readFileSync(path.join(repo, 'scripts', 'phase1_collect_candidates.js'), 'utf8');
const monitorPath = path.join(repo, 'scripts', 'run_multi_games_reliable.ps1');

assert(!Object.prototype.hasOwnProperty.call(pkg, 'version'), 'package.json must not declare a project version');
assert(!Object.prototype.hasOwnProperty.call(lock, 'version'), 'package-lock.json must not declare a root project version');
assert(lock.packages && lock.packages[''], 'package-lock.json must contain the root package record');
assert(!Object.prototype.hasOwnProperty.call(lock.packages[''], 'version'), 'package-lock root package must not declare a project version');
assert(!/(?:^|\n)version:\s*[^\n]+/.test(skill), 'SKILL.md frontmatter must not declare a project version');
assert(!/\bskill_version\b/.test(phase1), 'Phase 1 index must not emit project version metadata');
assert(!/^\s*version:\s*['"][^'"]+['"],?\s*$/m.test(phase1), 'Phase 1 diagnostics must not emit project version metadata');
assert(fs.existsSync(monitorPath), 'stable monitor entrypoint is missing');

const skipDirs = new Set(['.git', 'node_modules', 'runs']);
const suspiciousName = /(^|[_\-.])v\d+(?:\.\d+){0,2}(?=$|[_\-.])/i;

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

const badNames = walk(repo)
  .map((file) => path.relative(repo, file).replace(/\\/g, '/'))
  .filter((file) => suspiciousName.test(path.basename(file)));

assert.deepStrictEqual(badNames, [], `project-version-like filenames remain: ${badNames.join(', ')}`);

console.log('project metadata checks passed');
