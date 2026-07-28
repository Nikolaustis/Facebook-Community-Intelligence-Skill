const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJsonFile, writeJsonAtomic } = require('./json_io');

const PREFILTER_VERSION = '7.1.0';

const GENERIC_SHORT_QUERY_TERMS = new Set([
  'id', 'my', 'sea', 'eu', 'na', 'cn', 'hk', 'tw', 'jp', 'kr', 'th', 'vn', 'ph', 'br',
  'global', 'official', 'trade', 'buy', 'sell', 'group', 'community', 'game', 'mobile',
  'online', 'roblox', 'server', 'guild', 'club', 'market', 'shop', 'fans', 'fan', 'news',
]);

function scalarText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map((item) => scalarText(item)).filter(Boolean).join(' ');
  return '';
}

function clean(value) {
  return scalarText(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function boolLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function intLike(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function stripDiacritics(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeWords(value) {
  return stripDiacritics(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[:：]+/g, ' ')
    .replace(/[×✕✖]/g, ' x ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(value) {
  return normalizeWords(value).replace(/\s+/g, '');
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function uniqueObjects(values, keyFn) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(value) {
  const raw = clean(value);
  const base = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44);
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 8);
  return base ? `${base}_${hash}` : `game_${hash}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function fileFingerprint(file) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  return {
    path: resolved,
    size_bytes: stat.size,
    mtime_ms: Math.floor(stat.mtimeMs),
  };
}

function resolveChildFile(value, parentFile) {
  const text = clean(value);
  if (!text) return '';
  return path.isAbsolute(text) ? path.normalize(text) : path.resolve(path.dirname(parentFile), text);
}

function titleCaseLoose(value) {
  return clean(value)
    .split(/\s+/)
    .map((token) => {
      if (/^[A-Z0-9]+$/.test(token)) return token;
      if (token.length <= 1) return token.toUpperCase();
      return token.slice(0, 1).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

function buildAutomaticSearchVariants(gameName) {
  const raw = clean(gameName);
  const normalized = normalizeWords(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const variants = [{ query: raw, type: 'canonical' }];

  if (normalized && normalizeWords(raw) !== clean(raw).toLowerCase()) {
    variants.push({ query: normalized, type: 'punctuation_normalized' });
  }

  if (tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const merged = tokens
        .map((token, idx) => (idx === i ? `${token}${tokens[i + 1]}` : (idx === i + 1 ? '' : token)))
        .filter(Boolean)
        .join(' ');
      if (merged) variants.push({ query: titleCaseLoose(merged), type: 'compact_spacing' });
    }

    if (tokens.length >= 4) {
      const pairMerged = [];
      for (let i = 0; i < tokens.length; i += 2) {
        pairMerged.push(i + 1 < tokens.length ? `${tokens[i]}${tokens[i + 1]}` : tokens[i]);
      }
      variants.push({ query: titleCaseLoose(pairMerged.join(' ')), type: 'compact_spacing' });
    }
  }

  return uniqueObjects(variants, (item) => normalizeCompact(item.query));
}

function buildHistoricalSafeVariants(gameName) {
  const normalized = normalizeWords(gameName);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const out = [];

  // The uploaded 2026.4-2026.7 positive corpus shows recurring full-title variants
  // such as Anime Vanguard(s), LINE Ranger(s), Blox Fruit(s), and Seven Knight(s).
  // Only the final English token is singularized, and the whole title is retained.
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    if (/^[a-z]+s$/.test(last) && !/ss$/.test(last) && last.length >= 5) {
      out.push({
        query: [...tokens.slice(0, -1), last.slice(0, -1)].join(' '),
        type: 'historical_safe_singular',
      });
    }
  }

  // Safe connector elision observed in Seal M (on) CROSS and Ran Mobile (the)
  // Master Class. Never reduce a title to a bare brand token here.
  if (tokens.length >= 3) {
    const connectors = new Set(['the', 'on', 'of']);
    const withoutConnectors = tokens.filter((token) => !connectors.has(token));
    if (withoutConnectors.length >= 2 && withoutConnectors.length < tokens.length) {
      out.push({ query: withoutConnectors.join(' '), type: 'historical_safe_connector_elision' });
    }
  }

  return uniqueObjects(out, (item) => normalizeCompact(item.query));
}

function configuredSearchVariants(gameName, config) {
  const overrides = config && config.title_variant_overrides && typeof config.title_variant_overrides === 'object'
    ? config.title_variant_overrides
    : {};
  const override = overrides[gameName] || {};
  const variants = Array.isArray(override.search_variants) ? override.search_variants : [];
  const out = [];
  for (const item of variants) {
    if (typeof item === 'string') {
      if (clean(item)) out.push({ query: clean(item), type: 'configured_variant' });
      continue;
    }
    if (item && typeof item === 'object' && clean(item.query)) {
      out.push({ query: clean(item.query), type: clean(item.type) || 'configured_variant' });
    }
  }
  return out;
}

function phraseRecord(phrase, source, strength = 50) {
  const raw = clean(phrase);
  const compact = normalizeCompact(raw);
  if (!raw || !compact) return null;
  return { phrase: raw, compact, source, strength };
}

function buildProfile(gameName, config) {
  const aliases = config && config.aliases && typeof config.aliases === 'object' && Array.isArray(config.aliases[gameName])
    ? config.aliases[gameName]
    : [];
  const ipRoots = config && config.ip_roots && typeof config.ip_roots === 'object' && Array.isArray(config.ip_roots[gameName])
    ? config.ip_roots[gameName]
    : [];

  const phrases = [];
  phrases.push(phraseRecord(gameName, 'canonical_title', 100));
  for (const item of buildAutomaticSearchVariants(gameName)) {
    phrases.push(phraseRecord(item.query, `automatic:${item.type}`, item.type === 'canonical' ? 100 : 86));
  }
  for (const item of buildHistoricalSafeVariants(gameName)) {
    phrases.push(phraseRecord(item.query, `historical:${item.type}`, 82));
  }
  for (const alias of aliases) phrases.push(phraseRecord(alias, 'configured_alias', 95));
  for (const item of configuredSearchVariants(gameName, config)) {
    phrases.push(phraseRecord(item.query, `configured:${item.type}`, item.type === 'connector_x' ? 78 : 92));
  }

  return {
    gameName,
    phrases: uniqueObjects(phrases.filter(Boolean), (item) => item.compact)
      .sort((a, b) => (b.compact.length - a.compact.length) || (b.strength - a.strength)),
    ipRoots: uniqueObjects(
      ipRoots.map((root) => phraseRecord(root, 'ip_root', 20)).filter(Boolean),
      (item) => item.compact,
    ),
  };
}

function buildProfiles(gameEntries, config) {
  const profiles = new Map();
  for (const entry of gameEntries || []) {
    const gameName = clean(entry && entry.game_name);
    if (!gameName || profiles.has(gameName)) continue;
    profiles.set(gameName, buildProfile(gameName, config || {}));
  }

  const siblingTitlesConfig = config && config.sibling_titles && typeof config.sibling_titles === 'object'
    ? config.sibling_titles
    : {};
  const allNames = Array.from(profiles.keys());
  for (const [gameName, profile] of profiles.entries()) {
    const configuredSiblingNames = Array.isArray(siblingTitlesConfig[gameName]) ? siblingTitlesConfig[gameName] : [];
    const siblingNames = unique([...allNames.filter((name) => name !== gameName), ...configuredSiblingNames]);
    const siblingPhrases = [];
    for (const siblingName of siblingNames) {
      const siblingProfile = profiles.get(siblingName) || buildProfile(siblingName, config || {});
      for (const item of siblingProfile.phrases) {
        siblingPhrases.push({ ...item, sibling_game_name: siblingName });
      }
    }
    profile.siblingPhrases = uniqueObjects(siblingPhrases, (item) => `${item.sibling_game_name}::${item.compact}`)
      .sort((a, b) => b.compact.length - a.compact.length);
  }
  return profiles;
}

function isShortStandaloneLatinAlias(phrase) {
  const compact = normalizeCompact(phrase);
  const words = normalizeWords(phrase);
  return Boolean(compact && compact.length <= 5 && /^[a-z0-9]+$/i.test(compact) && words && !words.includes(' '));
}

function phraseUsesOnlyLatinLettersAndNumbers(phrase) {
  const raw = stripDiacritics(clean(phrase)).normalize('NFKC');
  const alphanumeric = raw.match(/[\p{Letter}\p{Number}]/gu) || [];
  if (!alphanumeric.length) return false;
  return alphanumeric.every((character) => /[\p{Script=Latin}\p{Number}]/u.test(character));
}

function buildPhraseRegex(phrase) {
  const raw = stripDiacritics(clean(phrase)).normalize('NFKC');
  const compact = normalizeCompact(raw);
  const tokens = isShortStandaloneLatinAlias(raw)
    ? (compact.match(/[a-z]+|[0-9]+/gi) || [])
    : (raw.match(/[\p{Letter}\p{Number}]+/gu) || []);
  if (!tokens.length) return null;

  // Facebook group names frequently concatenate an English game title directly
  // with Chinese, Thai, Lao, Arabic, Hangul, Cyrillic, or another non-Latin script.
  // A Unicode-wide \p{Letter} boundary rejects those legitimate script transitions.
  // For a title made only of Latin letters/numbers, therefore, boundary checks are
  // limited to the Latin script plus numbers. Latin continuations such as Pieces,
  // DefenseX, PieceMN, or 99100 remain blocked.
  const latinScriptBoundary = phraseUsesOnlyLatinLettersAndNumbers(raw);
  const boundaryClass = latinScriptBoundary
    ? '\\p{Script=Latin}\\p{Number}'
    : '\\p{Letter}\\p{Number}';
  const separator = '[\\s\\p{P}\\p{S}\\p{Cf}_]*';
  const body = tokens.map((token) => escapeRegExp(token)).join(separator);
  const numericContinuationGuard = isShortStandaloneLatinAlias(raw) && /[a-z]$/i.test(compact)
    ? `(?!${separator}[0-9])`
    : '';
  const regex = new RegExp(
    `(^|[^${boundaryClass}])(${body})${numericContinuationGuard}(?=$|[^${boundaryClass}])`,
    'giu',
  );
  return {
    regex,
    boundary_mode: latinScriptBoundary ? 'latin_script_transition' : 'unicode_alphanumeric',
  };
}

function findPhraseHits(text, phraseItem) {
  const normalizedText = stripDiacritics(clean(text)).normalize('NFKC');
  const regexProfile = buildPhraseRegex(phraseItem.phrase);
  if (!regexProfile || !normalizedText) return [];
  const { regex, boundary_mode: boundaryMode } = regexProfile;
  const hits = [];
  let match;
  while ((match = regex.exec(normalizedText)) !== null) {
    const leading = match[1] || '';
    const matchedBody = match[2] || '';
    const start = match.index + leading.length;
    const end = start + matchedBody.length;
    hits.push({ ...phraseItem, start, end, matched_text: matchedBody, coordinate_space: 'text', boundary_mode: boundaryMode });
    if (regex.lastIndex === match.index) regex.lastIndex++;
  }
  if (hits.length) return hits;

  // Localized search terms are often agglutinated with a country/community suffix,
  // e.g. FC모바일코리아. For phrases containing non-Latin letters, allow a compact
  // match without requiring a script boundary. Short Latin aliases never use this path.
  if (/[^\x00-\x7F]/.test(phraseItem.phrase || '')) {
    const compactText = normalizeCompact(normalizedText);
    const compactPhrase = phraseItem.compact || normalizeCompact(phraseItem.phrase);
    const index = compactPhrase ? compactText.indexOf(compactPhrase) : -1;
    if (index >= 0) {
      return [{
        ...phraseItem,
        start: index,
        end: index + compactPhrase.length,
        matched_text: compactPhrase,
        coordinate_space: 'compact',
        boundary_mode: 'localized_compact',
      }];
    }
  }
  return [];
}

function queryIsUsable(query, minCompactLength = 3) {
  const raw = clean(query);
  if (!raw || /^\[.*\]$/.test(raw)) return false;
  const compact = normalizeCompact(raw);
  if (!compact || compact.length < minCompactLength) return false;
  const words = normalizeWords(raw).split(/\s+/).filter(Boolean);
  if (words.length === 1 && GENERIC_SHORT_QUERY_TERMS.has(words[0])) return false;
  return true;
}

function candidateQueryPhrases(candidate, options) {
  if (!options.use_source_queries) return [];
  const values = [];
  if (candidate && candidate.source_query) values.push(candidate.source_query);
  if (candidate && Array.isArray(candidate.source_queries)) values.push(...candidate.source_queries);
  const out = [];
  for (const query of unique(values.map((value) => clean(value)))) {
    if (!queryIsUsable(query, options.minimum_query_compact_length)) continue;
    out.push(phraseRecord(query, 'candidate_source_query', 72));
  }
  return uniqueObjects(out.filter(Boolean), (item) => item.compact);
}

function looksLikeIncompleteCandidateGroupName(groupName) {
  const name = clean(groupName);
  if (!name) return true;
  if (name.length < 2) return true;
  if (/[.…]{2,}\s*$/.test(name) || /\u2026\s*$/.test(name)) return true;
  if (/^(?:facebook group|group|community|loading|see more)$/i.test(name)) return true;
  return false;
}

function isHitEmbeddedInMoreSpecificSibling(targetHit, siblingHit) {
  if (!targetHit || !siblingHit) return false;
  if ((targetHit.coordinate_space || 'text') !== (siblingHit.coordinate_space || 'text')) return false;
  if (siblingHit.compact.length <= targetHit.compact.length) return false;
  if (!siblingHit.compact.includes(targetHit.compact)) return false;
  return targetHit.start >= siblingHit.start && targetHit.end <= siblingHit.end;
}

function isCandidateSourceQueryClaimedBySibling(targetHit, siblingHit) {
  if (!targetHit || !siblingHit || targetHit.source !== 'candidate_source_query') return false;
  if ((targetHit.coordinate_space || 'text') !== (siblingHit.coordinate_space || 'text')) return false;
  if (targetHit.compact !== siblingHit.compact) return false;
  return targetHit.start === siblingHit.start && targetHit.end === siblingHit.end;
}

function isTargetHitClaimedBySibling(targetHit, siblingHit) {
  return isHitEmbeddedInMoreSpecificSibling(targetHit, siblingHit)
    || isCandidateSourceQueryClaimedBySibling(targetHit, siblingHit);
}

function chooseBestHit(hits) {
  return [...(hits || [])].sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    if (b.compact.length !== a.compact.length) return b.compact.length - a.compact.length;
    return a.start - b.start;
  })[0] || null;
}

function evaluateCandidate(gameName, candidate, profiles, options) {
  const profile = profiles.get(gameName);
  if (!profile) {
    return { keep: true, decision: 'keep_inconclusive', reason: 'missing_game_profile', review: true };
  }

  if (candidate && candidate.source_is_seed_url) {
    return { keep: true, decision: 'keep_seed_url', reason: 'seed_group_url', review: true };
  }

  const groupName = clean(candidate && candidate.group_name);
  if (looksLikeIncompleteCandidateGroupName(groupName)) {
    return options.keep_missing_or_truncated_names
      ? { keep: true, decision: 'keep_inconclusive', reason: groupName ? 'truncated_group_name' : 'missing_group_name', review: true }
      : { keep: false, decision: 'reject_incomplete', reason: groupName ? 'truncated_group_name' : 'missing_group_name', review: false };
  }

  const targetPhrases = uniqueObjects(
    [...profile.phrases, ...candidateQueryPhrases(candidate, options)].filter(Boolean),
    (item) => item.compact,
  );
  const targetHits = targetPhrases.flatMap((item) => findPhraseHits(groupName, item));
  const siblingHits = (profile.siblingPhrases || []).flatMap((item) => findPhraseHits(groupName, item));

  if (targetHits.length) {
    const independentTargetHits = targetHits.filter((targetHit) => !siblingHits.some((siblingHit) => isTargetHitClaimedBySibling(targetHit, siblingHit)));
    if (!independentTargetHits.length) {
      const bestTarget = chooseBestHit(targetHits);
      const containingSibling = siblingHits.find((siblingHit) => isTargetHitClaimedBySibling(bestTarget, siblingHit)) || chooseBestHit(siblingHits);
      const exactSourceQueryCollision = Boolean(containingSibling && isCandidateSourceQueryClaimedBySibling(bestTarget, containingSibling));
      return {
        keep: false,
        decision: exactSourceQueryCollision ? 'reject_sibling_only' : 'reject_more_specific_sibling_only',
        reason: exactSourceQueryCollision ? 'source_query_is_sibling_title_or_alias' : 'target_evidence_only_inside_more_specific_sibling',
        review: false,
        match_phrase: bestTarget ? bestTarget.phrase : '',
        match_source: bestTarget ? bestTarget.source : '',
        match_boundary_mode: bestTarget ? bestTarget.boundary_mode || '' : '',
        sibling_phrase: containingSibling ? containingSibling.phrase : '',
        sibling_game_name: containingSibling ? containingSibling.sibling_game_name : '',
      };
    }
    const best = chooseBestHit(independentTargetHits);
    return {
      keep: true,
      decision: 'keep_strong_name_match',
      reason: best.source === 'candidate_source_query' ? 'source_query_in_group_name' : 'title_or_alias_in_group_name',
      review: false,
      match_phrase: best.phrase,
      match_source: best.source,
      match_boundary_mode: best.boundary_mode || '',
      matched_text: best.matched_text,
    };
  }

  if (siblingHits.length) {
    const bestSibling = chooseBestHit(siblingHits);
    if (options.keep_sibling_only_for_manual_review) {
      return {
        keep: true,
        decision: 'keep_sibling_review',
        reason: 'sibling_title_only',
        review: true,
        sibling_phrase: bestSibling.phrase,
        sibling_game_name: bestSibling.sibling_game_name,
      };
    }
    return {
      keep: false,
      decision: 'reject_sibling_only',
      reason: 'sibling_title_only',
      review: false,
      sibling_phrase: bestSibling.phrase,
      sibling_game_name: bestSibling.sibling_game_name,
    };
  }

  const ipRootHits = (profile.ipRoots || []).flatMap((item) => findPhraseHits(groupName, item));
  if (ipRootHits.length) {
    const best = chooseBestHit(ipRootHits);
    if (options.keep_ip_root_only) {
      return {
        keep: true,
        decision: 'keep_ip_root_review',
        reason: 'ip_root_only',
        review: true,
        match_phrase: best.phrase,
        match_source: best.source,
      };
    }
    return {
      keep: false,
      decision: 'reject_ip_root_only',
      reason: 'ip_root_without_title_or_query',
      review: false,
      match_phrase: best.phrase,
      match_source: best.source,
    };
  }

  return {
    keep: false,
    decision: 'reject_no_match',
    reason: 'no_title_alias_or_source_query_in_group_name',
    review: false,
  };
}

function mergeOptions(config = {}, overrides = {}) {
  const fromConfig = config.phase15_name_prefilter && typeof config.phase15_name_prefilter === 'object'
    ? config.phase15_name_prefilter
    : {};
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides || {}).filter(([, value]) => value !== undefined)
  );
  const merged = { ...fromConfig, ...definedOverrides };
  return {
    enabled: boolLike(merged.enabled, true),
    reuse_cache: boolLike(merged.reuse_cache, true),
    keep_missing_or_truncated_names: boolLike(merged.keep_missing_or_truncated_names, true),
    keep_ip_root_only: boolLike(merged.keep_ip_root_only, false),
    keep_sibling_only_for_manual_review: boolLike(merged.keep_sibling_only_for_manual_review, false),
    use_source_queries: boolLike(merged.use_source_queries, true),
    minimum_query_compact_length: intLike(merged.minimum_query_compact_length, 3, 2, 32),
    write_rejected_candidates: boolLike(merged.write_rejected_candidates, true),
    write_review_candidates: boolLike(merged.write_review_candidates, true),
    max_examples_per_reason: intLike(merged.max_examples_per_reason, 20, 1, 200),
  };
}

function buildRelevantConfigFingerprint(config, options) {
  return sha256Text(stableStringify({
    aliases: config.aliases || {},
    sibling_titles: config.sibling_titles || {},
    ip_roots: config.ip_roots || {},
    title_variant_overrides: config.title_variant_overrides || {},
    phase15_name_prefilter: options,
  }));
}

function writeProgress(file, payload) {
  if (!file) return;
  writeJsonAtomic(file, {
    stage: 'phase15_name_prefilter',
    status: payload.status || 'phase15_name_prefilter',
    updated_at: new Date().toISOString(),
    pid: process.pid,
    ...payload,
  });
}

function validateCachedManifest(manifest, fingerprint) {
  if (!manifest || manifest.version !== PREFILTER_VERSION || manifest.fingerprint !== fingerprint) return false;
  const required = [manifest.filtered_index_file, manifest.audit_file, ...(manifest.filtered_candidate_files || [])];
  return required.every((file) => file && fs.existsSync(file));
}

function preparePhase15Index({
  indexFile,
  index = null,
  config = {},
  outDir = '',
  progressFile = '',
  overrides = {},
  force = false,
} = {}) {
  const resolvedIndexFile = path.resolve(clean(indexFile));
  if (!resolvedIndexFile || !fs.existsSync(resolvedIndexFile)) {
    throw new Error(`Phase 1.5 index file does not exist: ${resolvedIndexFile}`);
  }
  const originalIndex = index || readJsonFile(resolvedIndexFile);
  if (!originalIndex || !Array.isArray(originalIndex.games) || !originalIndex.games.length) {
    throw new Error('Phase 1.5 requires a phase1 index with a non-empty games array.');
  }

  const options = mergeOptions(config, overrides);
  if (!options.enabled) {
    return {
      enabled: false,
      cache_hit: false,
      index: originalIndex,
      index_file: resolvedIndexFile,
      audit: {
        version: PREFILTER_VERSION,
        enabled: false,
        input_candidates: originalIndex.games.reduce((sum, game) => sum + Number(game.candidate_count || 0), 0),
        kept_candidates: null,
        rejected_candidates: 0,
      },
    };
  }

  const resolvedOutDir = path.resolve(outDir || path.dirname(resolvedIndexFile));
  const candidateOutDir = path.join(resolvedOutDir, 'phase15_candidates');
  const filteredIndexFile = path.join(resolvedOutDir, 'phase15_prefilter_index.json');
  const auditFile = path.join(resolvedOutDir, 'phase15_name_prefilter_audit.json');
  const rejectedFile = path.join(resolvedOutDir, 'phase15_name_prefilter_rejected.json');
  const reviewFile = path.join(resolvedOutDir, 'phase15_name_prefilter_review.json');
  const manifestFile = path.join(resolvedOutDir, 'phase15_name_prefilter_manifest.json');
  const ownProgressFile = path.join(resolvedOutDir, 'phase15_name_prefilter_progress.json');

  const sourceCandidateFiles = originalIndex.games.map((game) => resolveChildFile(game.candidates_file, resolvedIndexFile));
  for (let i = 0; i < sourceCandidateFiles.length; i++) {
    if (!sourceCandidateFiles[i] || !fs.existsSync(sourceCandidateFiles[i])) {
      throw new Error(`Phase 1.5 candidate file missing for ${clean(originalIndex.games[i].game_name)}: ${sourceCandidateFiles[i] || '(empty)'}`);
    }
  }

  const fingerprintPayload = {
    version: PREFILTER_VERSION,
    index: fileFingerprint(resolvedIndexFile),
    candidates: sourceCandidateFiles.map((file) => fileFingerprint(file)),
    config_hash: buildRelevantConfigFingerprint(config, options),
  };
  const fingerprint = sha256Text(stableStringify(fingerprintPayload));

  if (!force && options.reuse_cache && fs.existsSync(manifestFile)) {
    const manifest = readJsonFile(manifestFile, { allowMissing: true, defaultValue: null });
    if (validateCachedManifest(manifest, fingerprint)) {
      const cachedIndex = readJsonFile(manifest.filtered_index_file);
      const cachedAudit = readJsonFile(manifest.audit_file);
      writeProgress(ownProgressFile, {
        status: 'phase15_cache_hit',
        cache_hit: true,
        input_candidates: cachedAudit.input_candidates,
        kept_candidates: cachedAudit.kept_candidates,
        rejected_candidates: cachedAudit.rejected_candidates,
      });
      writeProgress(progressFile, {
        status: 'phase15_cache_hit',
        cache_hit: true,
        input_candidates: cachedAudit.input_candidates,
        kept_candidates: cachedAudit.kept_candidates,
        rejected_candidates: cachedAudit.rejected_candidates,
      });
      return {
        enabled: true,
        cache_hit: true,
        index: cachedIndex,
        index_file: manifest.filtered_index_file,
        audit: cachedAudit,
        audit_file: manifest.audit_file,
        rejected_file: manifest.rejected_file || rejectedFile,
        review_file: manifest.review_file || reviewFile,
        manifest_file: manifestFile,
      };
    }
  }

  fs.mkdirSync(candidateOutDir, { recursive: true });
  const profiles = buildProfiles(originalIndex.games, config);
  const totalCandidates = sourceCandidateFiles.reduce((sum, file) => {
    const rows = readJsonFile(file);
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
  writeProgress(ownProgressFile, { status: 'phase15_prefiltering', total_candidates: totalCandidates, processed_candidates: 0 });
  writeProgress(progressFile, { status: 'phase15_prefiltering', total_candidates: totalCandidates, processed_candidates: 0 });

  const filteredGames = [];
  const rejectedRows = [];
  const reviewRows = [];
  const reasonCounts = {};
  const decisionCounts = {};
  const matchBoundaryModeCounts = {};
  const perGame = [];
  let processed = 0;
  let keptTotal = 0;
  let rejectedTotal = 0;
  let reviewTotal = 0;

  for (let gameIndex = 0; gameIndex < originalIndex.games.length; gameIndex++) {
    const game = originalIndex.games[gameIndex];
    const gameName = clean(game.game_name);
    const sourceFile = sourceCandidateFiles[gameIndex];
    const candidates = readJsonFile(sourceFile);
    if (!Array.isArray(candidates)) throw new Error(`Candidate file for ${gameName} must contain a JSON array: ${sourceFile}`);

    const kept = [];
    const gameReasonCounts = {};
    const gameDecisionCounts = {};
    const gameMatchBoundaryModeCounts = {};
    const examples = {};
    let gameReviewCount = 0;

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      const candidate = candidates[candidateIndex];
      const result = evaluateCandidate(gameName, candidate, profiles, options);
      const reason = result.reason || 'unknown';
      const decision = result.decision || (result.keep ? 'keep' : 'reject');
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      decisionCounts[decision] = (decisionCounts[decision] || 0) + 1;
      gameReasonCounts[reason] = (gameReasonCounts[reason] || 0) + 1;
      gameDecisionCounts[decision] = (gameDecisionCounts[decision] || 0) + 1;
      const matchBoundaryMode = result.match_boundary_mode || '';
      if (matchBoundaryMode) {
        matchBoundaryModeCounts[matchBoundaryMode] = (matchBoundaryModeCounts[matchBoundaryMode] || 0) + 1;
        gameMatchBoundaryModeCounts[matchBoundaryMode] = (gameMatchBoundaryModeCounts[matchBoundaryMode] || 0) + 1;
      }
      if (!examples[reason]) examples[reason] = [];
      if (examples[reason].length < options.max_examples_per_reason) {
        examples[reason].push({
          group_name: clean(candidate && candidate.group_name),
          group_url: clean(candidate && candidate.group_url),
          source_query: clean(candidate && candidate.source_query),
          decision,
          match_phrase: result.match_phrase || '',
          match_boundary_mode: result.match_boundary_mode || '',
          sibling_phrase: result.sibling_phrase || '',
        });
      }

      const auditFields = {
        __phase15_prefilter_decision: decision,
        __phase15_prefilter_reason: reason,
        __phase15_prefilter_match_phrase: result.match_phrase || '',
        __phase15_prefilter_match_source: result.match_source || '',
        __phase15_prefilter_match_boundary_mode: result.match_boundary_mode || '',
        __phase15_prefilter_sibling_phrase: result.sibling_phrase || '',
        __phase15_prefilter_sibling_game_name: result.sibling_game_name || '',
      };

      if (result.keep) {
        kept.push({ ...(candidate || {}), ...auditFields });
        keptTotal++;
        if (result.review) {
          gameReviewCount++;
          reviewTotal++;
          if (options.write_review_candidates) {
            reviewRows.push({ game_name: gameName, candidate_index: candidateIndex, ...auditFields, candidate });
          }
        }
      } else {
        rejectedTotal++;
        if (options.write_rejected_candidates) {
          rejectedRows.push({ game_name: gameName, candidate_index: candidateIndex, ...auditFields, candidate });
        }
      }

      processed++;
      if (processed % 250 === 0 || processed === totalCandidates) {
        const progress = {
          status: 'phase15_prefiltering',
          current_game_name: gameName,
          current_game_index: gameIndex + 1,
          total_games: originalIndex.games.length,
          processed_candidates: processed,
          total_candidates: totalCandidates,
          kept_candidates: keptTotal,
          rejected_candidates: rejectedTotal,
        };
        writeProgress(ownProgressFile, progress);
        writeProgress(progressFile, progress);
      }
    }

    const filteredCandidateFile = path.join(candidateOutDir, `${String(gameIndex + 1).padStart(3, '0')}_${slugify(gameName)}.json`);
    writeJsonAtomic(filteredCandidateFile, kept);
    filteredGames.push({
      ...game,
      original_candidates_file: sourceFile,
      candidates_file: path.relative(resolvedOutDir, filteredCandidateFile).replace(/\\/g, '/'),
      phase15_input_count: candidates.length,
      phase15_kept_count: kept.length,
      phase15_rejected_count: candidates.length - kept.length,
      phase15_review_count: gameReviewCount,
    });
    perGame.push({
      game_name: gameName,
      original_candidates_file: sourceFile,
      filtered_candidates_file: filteredCandidateFile,
      input_candidates: candidates.length,
      kept_candidates: kept.length,
      rejected_candidates: candidates.length - kept.length,
      review_candidates: gameReviewCount,
      reduction_rate: candidates.length ? Number(((candidates.length - kept.length) / candidates.length).toFixed(6)) : 0,
      reason_counts: gameReasonCounts,
      decision_counts: gameDecisionCounts,
      match_boundary_mode_counts: gameMatchBoundaryModeCounts,
      examples,
    });
  }

  const filteredIndex = {
    ...originalIndex,
    phase15_name_prefilter: {
      version: PREFILTER_VERSION,
      generated_at: new Date().toISOString(),
      source_index_file: resolvedIndexFile,
      audit_file: auditFile,
      rejected_file: options.write_rejected_candidates ? rejectedFile : '',
      review_file: options.write_review_candidates ? reviewFile : '',
      input_candidates: totalCandidates,
      kept_candidates: keptTotal,
      rejected_candidates: rejectedTotal,
      reduction_rate: totalCandidates ? Number((rejectedTotal / totalCandidates).toFixed(6)) : 0,
    },
    games: filteredGames,
  };

  const audit = {
    audit_kind: 'facebook_group_monitor_phase15_name_prefilter',
    version: PREFILTER_VERSION,
    generated_at: new Date().toISOString(),
    source_index_file: resolvedIndexFile,
    filtered_index_file: filteredIndexFile,
    enabled: true,
    cache_hit: false,
    options,
    historical_reference_summary: {
      workbook_rows_reviewed: 7501,
      games_reviewed: 62,
      direct_title_or_compact_title_share: 0.968138,
      observed_safe_variants: [
        'punctuation_and_spacing_normalization',
        'final_token_singular_plural_variation',
        'connector_word_elision_in_full_title',
        'configured_or_source-query_aliases',
        'localized_titles_requiring_explicit_query_or_alias',
        'latin_title_adjacent_to_non_latin_script',
        'unicode_format_controls_between_title_tokens',
      ],
      legacy_false_positive_guardrails: [
        'short_alias_requires_standalone_token_boundaries',
        'letter_alias_does_not_match_numbered_continuation',
        'more_specific_sibling_title_suppresses_embedded_shorter_title',
      ],
    },
    input_candidates: totalCandidates,
    kept_candidates: keptTotal,
    rejected_candidates: rejectedTotal,
    review_candidates: reviewTotal,
    reduction_rate: totalCandidates ? Number((rejectedTotal / totalCandidates).toFixed(6)) : 0,
    reason_counts: reasonCounts,
    decision_counts: decisionCounts,
    match_boundary_mode_counts: matchBoundaryModeCounts,
    per_game: perGame,
  };

  writeJsonAtomic(filteredIndexFile, filteredIndex);
  writeJsonAtomic(auditFile, audit);
  if (options.write_rejected_candidates) writeJsonAtomic(rejectedFile, rejectedRows);
  if (options.write_review_candidates) writeJsonAtomic(reviewFile, reviewRows);

  const manifest = {
    manifest_kind: 'facebook_group_monitor_phase15_name_prefilter_cache',
    version: PREFILTER_VERSION,
    generated_at: new Date().toISOString(),
    fingerprint,
    fingerprint_payload: fingerprintPayload,
    source_index_file: resolvedIndexFile,
    filtered_index_file: filteredIndexFile,
    audit_file: auditFile,
    rejected_file: options.write_rejected_candidates ? rejectedFile : '',
    review_file: options.write_review_candidates ? reviewFile : '',
    filtered_candidate_files: filteredGames.map((game) => resolveChildFile(game.candidates_file, filteredIndexFile)),
  };
  writeJsonAtomic(manifestFile, manifest);

  const finalProgress = {
    status: 'phase15_complete',
    completed_at: new Date().toISOString(),
    total_candidates: totalCandidates,
    processed_candidates: totalCandidates,
    kept_candidates: keptTotal,
    rejected_candidates: rejectedTotal,
    review_candidates: reviewTotal,
    reduction_rate: audit.reduction_rate,
    filtered_index_file: filteredIndexFile,
    audit_file: auditFile,
  };
  writeProgress(ownProgressFile, finalProgress);
  writeProgress(progressFile, finalProgress);

  return {
    enabled: true,
    cache_hit: false,
    index: filteredIndex,
    index_file: filteredIndexFile,
    audit,
    audit_file: auditFile,
    rejected_file: options.write_rejected_candidates ? rejectedFile : '',
    review_file: options.write_review_candidates ? reviewFile : '',
    manifest_file: manifestFile,
  };
}

module.exports = {
  PREFILTER_VERSION,
  clean,
  normalizeWords,
  normalizeCompact,
  buildAutomaticSearchVariants,
  buildHistoricalSafeVariants,
  phraseUsesOnlyLatinLettersAndNumbers,
  buildPhraseRegex,
  buildProfiles,
  evaluateCandidate,
  mergeOptions,
  preparePhase15Index,
  looksLikeIncompleteCandidateGroupName,
};
