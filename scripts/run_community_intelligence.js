'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJson } = require('../src/config/load_config');
const { normalizeConfig, normalizeSubject, toLegacyTaskConfig } = require('../src/domain/schema');
const { buildDiscoveryPlan } = require('../src/discovery/discovery_plan');
const { CommunityStore } = require('../src/store/community_store');
const { EvidenceStore } = require('../src/store/evidence_store');
const { evaluateCommunitySubject } = require('../src/intelligence/match_engine');
const { FacebookGroupsAdapter, normalizeValidatedRow } = require('../src/sources/facebook_groups');
const { exportCommunityIntelligence } = require('../src/export/community_export');
const { RunManifest } = require('../src/observability/run_manifest');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function splitList(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited with code ${result.status}`);
  }
}

function applyCliSubjectOverride(raw, args) {
  if (args.subjects) {
    return {
      ...raw,
      subjects: splitList(args.subjects).map((name, index) => normalizeSubject({ name, type: 'custom' }, index)),
    };
  }
  if (args.games) {
    process.stderr.write('[deprecated] --games is accepted for compatibility; use --subjects.\n');
    return { ...raw, games: splitList(args.games), subjects: undefined };
  }
  return raw;
}

function buildIntelligence({ rows, subjects }) {
  const communities = new CommunityStore();
  const evidence = new EvidenceStore();
  const subjectByName = new Map(subjects.map((s) => [s.subject_name.normalize('NFKC').toLowerCase(), s]));
  const matches = [];

  for (const rawRow of rows) {
    const row = rawRow.group_url ? rawRow : normalizeValidatedRow(rawRow);
    if (!row.group_url) continue;
    const community = communities.upsert({
      url: row.group_url,
      name: row.group_name,
      members: row.members,
      posts_today: row.posts_today,
      new_members_week: row.new_members_week,
      language: row.language,
      region: row.region,
    });

    for (const [type, value] of [
      ['members', row.members],
      ['posts_today', row.posts_today],
      ['new_members_week', row.new_members_week],
      ['language', row.language],
      ['region', row.region],
    ]) {
      if (value !== null && value !== undefined && value !== '') {
        evidence.add({
          community_id: community.community_id,
          evidence_type: type,
          source_url: row.group_url,
          value,
          raw: row.raw || null,
        });
      }
    }

    const target = row.subject_name
      ? subjectByName.get(String(row.subject_name).normalize('NFKC').toLowerCase())
      : null;
    const subjectsToEvaluate = target ? [target] : subjects;

    for (const subject of subjectsToEvaluate) {
      const decision = evaluateCommunitySubject({
        community_name: row.group_name || '',
        source_queries: row.source_query ? [row.source_query] : [],
      }, subject);
      matches.push({
        community_id: community.community_id,
        subject_id: subject.subject_id,
        match_type: decision.match_type,
        confidence: decision.confidence,
        evidence: decision.evidence,
        status: decision.status,
      });
    }
  }

  const dedup = new Map();
  for (const match of matches) {
    const key = `${match.community_id}\0${match.subject_id}`;
    const prior = dedup.get(key);
    if (!prior || match.confidence > prior.confidence) dedup.set(key, match);
  }

  return {
    communities: communities.values(),
    evidence: evidence.values(),
    matches: [...dedup.values()],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configFile = path.resolve(args.config || 'assets/subject_config.template.json');
  const outDir = path.resolve(args['out-dir'] || path.join('runs', 'community-intelligence'));
  const raw = applyCliSubjectOverride(readJson(configFile), args);
  const normalized = normalizeConfig(raw);
  const manifest = new RunManifest({
    outDir,
    mode: args['skip-collection'] ? 'offline' : 'facebook',
    subjectCount: normalized.subjects.length,
  });

  try {
    manifest.start('planning');
    const plan = buildDiscoveryPlan(normalized.subjects);
    writeJson(path.join(outDir, 'normalized_subject_config.json'), normalized);
    writeJson(path.join(outDir, 'discovery_plan.json'), plan);
    manifest.end('planning', { query_count: plan.plans.reduce((n, x) => n + x.queries.length, 0) });

    let rows = [];
    if (args.rows) {
      const loaded = readJson(args.rows);
      rows = (Array.isArray(loaded) ? loaded : loaded.rows || []).map(normalizeValidatedRow);
    }

    if (!args['skip-collection']) {
      manifest.start('collection');
      const legacyConfig = toLegacyTaskConfig(normalized);
      const legacyConfigFile = path.join(outDir, 'generated_legacy_task_config.json');
      writeJson(legacyConfigFile, legacyConfig);
      const names = normalized.subjects.map((s) => s.subject_name).join(',');

      runNode(path.resolve('scripts/run_collector_reliable.js'), [
        'phase1', '--games', names, '--out-dir', outDir, '--config', legacyConfigFile,
      ]);
      runNode(path.resolve('scripts/phase15_prefilter_candidates.js'), [
        '--index', path.join(outDir, 'phase1_index.json'),
        '--config', legacyConfigFile,
        '--out-dir', outDir,
      ]);
      runNode(path.resolve('scripts/run_collector_reliable.js'), [
        'phase2',
        '--index', path.join(outDir, 'phase1_index.json'),
        '--config', legacyConfigFile,
      ]);
      manifest.end('collection');
    }

    manifest.start('normalization');
    if (!rows.length) {
      rows = new FacebookGroupsAdapter().readValidatedRows(outDir);
    }
    const intelligence = buildIntelligence({ rows, subjects: normalized.subjects });
    manifest.end('normalization', { validated_row_count: rows.length });

    manifest.start('export');
    const exportStats = exportCommunityIntelligence({
      outDir,
      subjects: normalized.subjects,
      communities: intelligence.communities,
      matches: intelligence.matches,
      evidence: intelligence.evidence,
      legacyFlattened: args['legacy-export'] !== 'false',
    });
    manifest.end('export', exportStats);
    manifest.counters({
      unique_communities: exportStats.community_count,
      subject_matches: exportStats.match_count,
      evidence_records: exportStats.evidence_count,
    });
    manifest.complete();

    process.stdout.write(JSON.stringify({ ok: true, out_dir: outDir, ...exportStats }, null, 2) + '\n');
  } catch (error) {
    manifest.fail('pipeline', error);
    throw error;
  }
}

if (require.main === module) main();
module.exports = { parseArgs, buildIntelligence };
