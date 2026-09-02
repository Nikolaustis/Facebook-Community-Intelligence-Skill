'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJsonFile } = require('./json_io');
const { cleanText, sanitizeGroupName } = require('./group_name_utils');

const VERSION = '7.2.0';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else { out[key] = next; i++; }
  }
  return out;
}

function boolValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !/^(?:0|false|no|off)$/i.test(String(value));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedWords(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedCompact(value) {
  return normalizedWords(value).replace(/\s+/g, '');
}

function isLatinNumericPhrase(value) {
  const text = cleanText(value);
  return Boolean(text) && !/[^\p{Script=Latin}\p{Number}\s\p{P}\p{S}_]/u.test(text);
}

function phrasePattern(value) {
  const phrase = cleanText(value);
  if (!phrase) return null;
  const normalized = phrase.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, ' ');
  const tokens = normalized.split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
  if (!tokens.length) return null;
  const body = tokens.map(escapeRegExp).join('[\\s\\p{P}\\p{S}\\p{Cf}_]*');
  if (isLatinNumericPhrase(normalized)) {
    return {
      regex: new RegExp(`(^|[^\\p{Script=Latin}\\p{Number}])${body}(?=$|[^\\p{Script=Latin}\\p{Number}])`, 'iu'),
      boundary_mode: 'latin_script_transition',
    };
  }
  if (tokens.every((x) => /[^\p{Script=Latin}\p{Number}]/u.test(x))) {
    return { regex: new RegExp(body, 'iu'), boundary_mode: 'localized_compact' };
  }
  return {
    regex: new RegExp(`(^|[^\\p{Letter}\\p{Number}])${body}(?=$|[^\\p{Letter}\\p{Number}])`, 'iu'),
    boundary_mode: 'unicode_alphanumeric',
  };
}

function phraseMatches(text, phrase) {
  const pattern = phrasePattern(phrase);
  if (!pattern) return null;
  const source = cleanText(text).normalize('NFKC');
  if (!pattern.regex.test(source)) return null;
  return { phrase: cleanText(phrase), boundary_mode: pattern.boundary_mode };
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const cleaned = cleanText(typeof value === 'object' && value ? value.query : value);
    if (!cleaned) continue;
    const key = normalizedCompact(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function getGamePhrases(config, gameName, candidates, useSourceQueries = true) {
  const aliases = config.aliases && typeof config.aliases === 'object' ? config.aliases[gameName] || [] : [];
  const override = config.title_variant_overrides && typeof config.title_variant_overrides === 'object'
    ? config.title_variant_overrides[gameName] || {}
    : {};
  const variants = Array.isArray(override.search_variants) ? override.search_variants : [];
  const sourceQueries = [];
  if (useSourceQueries) {
    for (const c of candidates || []) {
      if (c && c.source_query && c.source_query !== '[seed_group_url]') sourceQueries.push(c.source_query);
      if (Array.isArray(c && c.source_queries)) sourceQueries.push(...c.source_queries.filter((x) => x !== '[seed_group_url]'));
    }
  }
  return uniqueStrings([gameName, ...aliases, ...variants, ...sourceQueries]);
}

function getSiblingPhrases(config, gameName, allGameNames) {
  const explicit = config.sibling_titles && typeof config.sibling_titles === 'object' ? config.sibling_titles[gameName] || [] : [];
  const aliases = config.aliases && typeof config.aliases === 'object' ? config.aliases : {};
  const auto = [];
  for (const other of allGameNames) {
    if (other === gameName) continue;
    auto.push(other, ...(Array.isArray(aliases[other]) ? aliases[other] : []));
  }
  return uniqueStrings([...explicit, ...auto]);
}

function looksTruncated(name) {
  const value = cleanText(name);
  return !value || /(?:\.{2,}|…+)\s*$/u.test(value) || /^(?:facebook group|group|community|loading|see more)$/iu.test(value);
}

function bestMatch(text, phrases) {
  let best = null;
  for (const phrase of phrases || []) {
    const matched = phraseMatches(text, phrase);
    if (!matched) continue;
    const len = normalizedCompact(phrase).length;
    if (!best || len > best.length) best = { ...matched, length: len };
  }
  return best;
}

function classifyCandidate(candidate, profile, options) {
  const normalized = sanitizeGroupName(candidate && candidate.group_name, {
    source: candidate && candidate.phase1_name_source || '',
  });
  const groupName = normalized.clean_name;
  const base = {
    candidate: { ...candidate, group_name: groupName || cleanText(candidate && candidate.group_name) },
    normalization_reasons: normalized.reasons,
  };

  if (options.enabled === false) {
    return { ...base, decision: 'keep_inconclusive', reason: 'prefilter_disabled', match_phrase: '', match_source: '', boundary_mode: '' };
  }
  if (candidate && candidate.source_is_seed_url) {
    return { ...base, decision: 'keep_inconclusive', reason: 'seed_group_url', match_phrase: '', match_source: '', boundary_mode: '' };
  }
  if (looksTruncated(groupName)) {
    if (options.keep_missing_or_truncated_names !== false) {
      return { ...base, decision: 'keep_inconclusive', reason: 'truncated_group_name', match_phrase: '', match_source: '', boundary_mode: '' };
    }
    return { ...base, decision: 'reject_no_match', reason: 'missing_or_truncated_group_name', match_phrase: '', match_source: '', boundary_mode: '' };
  }

  const target = bestMatch(groupName, profile.target_phrases);
  const sibling = bestMatch(groupName, profile.sibling_phrases);
  if (sibling && (!target || sibling.length > target.length)) {
    return {
      ...base,
      decision: options.keep_sibling_only_for_manual_review ? 'keep_inconclusive' : 'reject_sibling_only',
      reason: 'sibling_title_only',
      match_phrase: '',
      match_source: '',
      sibling_phrase: sibling.phrase,
      boundary_mode: sibling.boundary_mode,
    };
  }
  if (target) {
    return {
      ...base,
      decision: 'keep_strong_name_match',
      reason: 'title_or_alias_in_group_name',
      match_phrase: target.phrase,
      match_source: target.phrase === profile.game_name ? 'canonical_title' : 'alias_or_source_query',
      sibling_phrase: sibling ? sibling.phrase : '',
      boundary_mode: target.boundary_mode,
    };
  }
  return {
    ...base,
    decision: 'reject_no_match',
    reason: 'no_title_alias_or_source_query_in_group_name',
    match_phrase: '',
    match_source: '',
    sibling_phrase: '',
    boundary_mode: '',
  };
}

function resolveInputPath(indexFile, value) {
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(path.dirname(indexFile), value);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function hashInputs(indexFile, configFile, options) {
  const h = crypto.createHash('sha256');
  h.update(VERSION);
  h.update(fs.readFileSync(indexFile));
  if (configFile && fs.existsSync(configFile)) h.update(fs.readFileSync(configFile));
  h.update(JSON.stringify(options));
  return h.digest('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const indexFile = path.resolve(args.index || args['phase1-index'] || '');
  if (!indexFile || !fs.existsSync(indexFile)) {
    console.error('Usage: node scripts/phase15_name_prefilter.js --index <phase1_index.json> --config <task_config.json> --out-dir <run_dir> [--force true]');
    process.exit(1);
  }
  const sourceIndex = readJsonFile(indexFile);
  const configFile = args.config ? path.resolve(args.config) : (sourceIndex.config_file ? resolveInputPath(indexFile, sourceIndex.config_file) : '');
  const config = configFile && fs.existsSync(configFile) ? readJsonFile(configFile) : {};
  const outDir = path.resolve(args['out-dir'] || path.join(path.dirname(indexFile), `phase15_${Date.now()}`));
  const options = {
    enabled: true,
    keep_missing_or_truncated_names: true,
    keep_sibling_only_for_manual_review: false,
    use_source_queries: true,
    write_rejected_candidates: true,
    write_review_candidates: true,
    ...(config.phase15_name_prefilter && typeof config.phase15_name_prefilter === 'object' ? config.phase15_name_prefilter : {}),
  };
  const force = boolValue(args.force, false);
  const manifestFile = path.join(outDir, 'phase15_name_prefilter_manifest.json');
  const inputHash = hashInputs(indexFile, configFile, options);
  if (!force && fs.existsSync(manifestFile)) {
    const old = readJsonFile(manifestFile);
    if (old.version === VERSION && old.input_hash === inputHash && old.filtered_index_file && fs.existsSync(old.filtered_index_file)) {
      console.log(JSON.stringify({ ok: true, cache_hit: true, version: VERSION, filtered_index_file: old.filtered_index_file }, null, 2));
      return;
    }
  }

  fs.mkdirSync(path.join(outDir, 'phase15_candidates'), { recursive: true });
  const games = Array.isArray(sourceIndex.games) ? sourceIndex.games : [];
  const allGameNames = games.map((x) => cleanText(x.game_name)).filter(Boolean);
  const rejected = [];
  const review = [];
  const audit = {
    audit_kind: 'facebook_group_monitor_phase15_name_prefilter',
    version: VERSION,
    generated_at: new Date().toISOString(),
    source_index_file: indexFile,
    filtered_index_file: path.join(outDir, 'phase15_prefilter_index.json'),
    enabled: true,
    cache_hit: false,
    options,
    input_candidates: 0,
    kept_candidates: 0,
    rejected_candidates: 0,
    review_candidates: 0,
    reduction_rate: 0,
    reason_counts: {},
    decision_counts: {},
    match_boundary_mode_counts: {},
    per_game: [],
  };
  const filteredIndex = {
    ...sourceIndex,
    created_at: new Date().toISOString(),
    mode: 'phase15_name_prefilter',
    skill_version: VERSION,
    source_phase1_index: indexFile,
    config_file: configFile || sourceIndex.config_file || '',
    out_dir: outDir,
    games: [],
  };

  games.forEach((game, gameIdx) => {
    const gameName = cleanText(game.game_name);
    const inputFile = resolveInputPath(indexFile, game.original_candidates_file || game.candidates_file);
    const candidates = inputFile && fs.existsSync(inputFile) ? readJsonFile(inputFile) : [];
    const profile = {
      game_name: gameName,
      target_phrases: getGamePhrases(config, gameName, candidates, options.use_source_queries !== false),
      sibling_phrases: getSiblingPhrases(config, gameName, allGameNames),
    };
    const kept = [];
    const per = {
      game_name: gameName,
      original_candidates_file: inputFile,
      input_candidates: candidates.length,
      kept_candidates: 0,
      rejected_candidates: 0,
      review_candidates: 0,
      reduction_rate: 0,
      reason_counts: {},
      decision_counts: {},
      match_boundary_mode_counts: {},
    };
    candidates.forEach((candidate, candidateIndex) => {
      const result = classifyCandidate(candidate, profile, options);
      const decorated = {
        ...result.candidate,
        __phase15_prefilter_decision: result.decision,
        __phase15_prefilter_reason: result.reason,
        __phase15_prefilter_match_phrase: result.match_phrase || '',
        __phase15_prefilter_match_source: result.match_source || '',
        __phase15_prefilter_sibling_phrase: result.sibling_phrase || '',
        __phase15_prefilter_match_boundary_mode: result.boundary_mode || '',
        __phase15_group_name_normalization: (result.normalization_reasons || []).join('|'),
      };
      audit.input_candidates++;
      per.reason_counts[result.reason] = (per.reason_counts[result.reason] || 0) + 1;
      per.decision_counts[result.decision] = (per.decision_counts[result.decision] || 0) + 1;
      audit.reason_counts[result.reason] = (audit.reason_counts[result.reason] || 0) + 1;
      audit.decision_counts[result.decision] = (audit.decision_counts[result.decision] || 0) + 1;
      if (result.boundary_mode) {
        per.match_boundary_mode_counts[result.boundary_mode] = (per.match_boundary_mode_counts[result.boundary_mode] || 0) + 1;
        audit.match_boundary_mode_counts[result.boundary_mode] = (audit.match_boundary_mode_counts[result.boundary_mode] || 0) + 1;
      }
      if (result.decision.startsWith('keep_')) {
        kept.push(decorated);
        audit.kept_candidates++;
        per.kept_candidates++;
        if (result.decision === 'keep_inconclusive') {
          review.push({ game_name: gameName, candidate_index: candidateIndex, ...decorated });
          audit.review_candidates++;
          per.review_candidates++;
        }
      } else {
        rejected.push({ game_name: gameName, candidate_index: candidateIndex, ...decorated });
        audit.rejected_candidates++;
        per.rejected_candidates++;
      }
    });
    per.reduction_rate = per.input_candidates ? Number((per.rejected_candidates / per.input_candidates).toFixed(6)) : 0;
    const slug = cleanText(game.slug || `${String(gameIdx + 1).padStart(3, '0')}_${gameName}`)
      .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    const outputFile = path.join(outDir, 'phase15_candidates', `${String(gameIdx + 1).padStart(3, '0')}_${slug}.json`);
    writeJson(outputFile, kept);
    filteredIndex.games.push({
      ...game,
      candidates_count: kept.length,
      candidates_file: outputFile,
      original_candidates_file: inputFile,
      phase15_input_count: candidates.length,
      phase15_kept_count: kept.length,
      phase15_rejected_count: per.rejected_candidates,
      phase15_review_count: per.review_candidates,
    });
    per.filtered_candidates_file = outputFile;
    audit.per_game.push(per);
  });

  audit.reduction_rate = audit.input_candidates ? Number((audit.rejected_candidates / audit.input_candidates).toFixed(6)) : 0;
  filteredIndex.phase15_name_prefilter = {
    version: VERSION,
    generated_at: audit.generated_at,
    source_index_file: indexFile,
    audit_file: path.join(outDir, 'phase15_name_prefilter_audit.json'),
    rejected_file: path.join(outDir, 'phase15_name_prefilter_rejected.json'),
    review_file: path.join(outDir, 'phase15_name_prefilter_review.json'),
    input_candidates: audit.input_candidates,
    kept_candidates: audit.kept_candidates,
    rejected_candidates: audit.rejected_candidates,
    reduction_rate: audit.reduction_rate,
  };

  writeJson(audit.filtered_index_file, filteredIndex);
  writeJson(path.join(outDir, 'phase15_name_prefilter_audit.json'), audit);
  if (options.write_rejected_candidates !== false) writeJson(path.join(outDir, 'phase15_name_prefilter_rejected.json'), rejected);
  if (options.write_review_candidates !== false) writeJson(path.join(outDir, 'phase15_name_prefilter_review.json'), review);
  const manifest = {
    version: VERSION,
    generated_at: audit.generated_at,
    input_hash: inputHash,
    source_index_file: indexFile,
    filtered_index_file: audit.filtered_index_file,
    audit_file: path.join(outDir, 'phase15_name_prefilter_audit.json'),
  };
  writeJson(manifestFile, manifest);
  writeJson(path.join(outDir, 'phase15_name_prefilter_progress.json'), {
    phase: 'phase15', status: 'completed', version: VERSION, ...filteredIndex.phase15_name_prefilter,
  });
  console.log(JSON.stringify({ ok: true, cache_hit: false, version: VERSION, phase15_prefilter_index: audit.filtered_index_file, summary: filteredIndex.phase15_name_prefilter }, null, 2));
}

if (require.main === module) main();

module.exports = {
  VERSION,
  phrasePattern,
  phraseMatches,
  classifyCandidate,
  looksTruncated,
  normalizedCompact,
};
