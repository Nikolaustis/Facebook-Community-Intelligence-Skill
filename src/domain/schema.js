'use strict';

const crypto = require('crypto');

const SUBJECT_TYPES = new Set([
  'game', 'brand', 'product', 'app', 'creator', 'company',
  'topic', 'event', 'competitor', 'franchise', 'custom',
]);

function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

function slugify(value) {
  return cleanString(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'subject';
}

function stableSubjectId(type, name) {
  const base = `${type}:${slugify(name)}`;
  const hash = crypto.createHash('sha1').update(`${type}\0${name}`).digest('hex').slice(0, 8);
  return `${base}:${hash}`;
}

function uniqStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const s = cleanString(value);
    if (!s) continue;
    const key = s.normalize('NFKC').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeRelationships(raw = {}) {
  return {
    related: uniqStrings(raw.related),
    mutually_exclusive: uniqStrings(raw.mutually_exclusive),
    children: uniqStrings(raw.children),
    parents: uniqStrings(raw.parents),
  };
}

function normalizeSubject(raw, index = 0) {
  const name = cleanString(raw && (raw.name || raw.subject_name || raw.title));
  if (!name) throw new Error(`subject at index ${index} is missing name`);
  const typeCandidate = cleanString(raw.type || raw.subject_type || 'custom').toLowerCase();
  const type = SUBJECT_TYPES.has(typeCandidate) ? typeCandidate : 'custom';
  const discovery = raw.discovery || {};
  const searchVariants = Array.isArray(discovery.search_variants)
    ? discovery.search_variants
    : Array.isArray(raw.search_variants) ? raw.search_variants : [];
  const seedUrls = Array.isArray(discovery.seed_group_urls)
    ? discovery.seed_group_urls
    : Array.isArray(raw.seed_group_urls) ? raw.seed_group_urls : [];

  return {
    subject_id: cleanString(raw.subject_id) || stableSubjectId(type, name),
    subject_name: name,
    subject_type: type,
    parent_subject: cleanString(raw.parent_subject) || null,
    aliases: uniqStrings(raw.aliases),
    ip_roots: uniqStrings(raw.ip_roots),
    relationships: normalizeRelationships(raw.relationships || {
      related: raw.related,
      mutually_exclusive: raw.mutually_exclusive || raw.sibling_titles,
      children: raw.children,
      parents: raw.parents,
    }),
    discovery: {
      search_variants: searchVariants
        .map((item) => typeof item === 'string' ? { query: item, type: 'alias' } : item)
        .filter((item) => item && cleanString(item.query))
        .map((item) => ({
          query: cleanString(item.query),
          type: cleanString(item.type) || 'variant',
          min_group_size: item.min_group_size ?? null,
          min_today_posts: item.min_today_posts ?? null,
          min_week_new_fans: item.min_week_new_fans ?? null,
        })),
      seed_group_urls: uniqStrings(seedUrls),
    },
  };
}

function migrateGamesConfig(raw) {
  const games = uniqStrings(raw.games);
  return games.map((game, index) => normalizeSubject({
    name: game,
    type: 'game',
    aliases: raw.aliases && raw.aliases[game],
    ip_roots: raw.ip_roots && raw.ip_roots[game],
    relationships: {
      mutually_exclusive: raw.sibling_titles && raw.sibling_titles[game],
    },
    discovery: raw.title_variant_overrides && raw.title_variant_overrides[game],
  }, index));
}

const DOMAIN_KEYS = new Set([
  'subjects', 'games', 'aliases', 'sibling_titles', 'ip_roots', 'title_variant_overrides',
]);

function normalizeConfig(raw = {}) {
  const hasSubjects = Array.isArray(raw.subjects) && raw.subjects.length > 0;
  const subjects = hasSubjects
    ? raw.subjects.map(normalizeSubject)
    : migrateGamesConfig(raw);

  if (!subjects.length) {
    throw new Error('config must contain at least one subject or legacy game');
  }

  const runtime = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!DOMAIN_KEYS.has(key)) runtime[key] = value;
  }

  return {
    subjects,
    runtime,
    compatibility: {
      migrated_from_games: !hasSubjects && Array.isArray(raw.games),
    },
  };
}

function toLegacyTaskConfig(normalized) {
  const games = normalized.subjects.map((s) => s.subject_name);
  const aliases = {};
  const sibling_titles = {};
  const ip_roots = {};
  const title_variant_overrides = {};

  for (const subject of normalized.subjects) {
    aliases[subject.subject_name] = subject.aliases;
    sibling_titles[subject.subject_name] = subject.relationships.mutually_exclusive;
    ip_roots[subject.subject_name] = subject.ip_roots;
    const variants = subject.discovery.search_variants || [];
    const seeds = subject.discovery.seed_group_urls || [];
    if (variants.length || seeds.length) {
      title_variant_overrides[subject.subject_name] = {
        search_variants: variants,
        seed_group_urls: seeds,
      };
    }
  }

  return {
    ...normalized.runtime,
    games,
    aliases,
    sibling_titles,
    ip_roots,
    title_variant_overrides,
  };
}

module.exports = {
  SUBJECT_TYPES,
  cleanString,
  slugify,
  stableSubjectId,
  uniqStrings,
  normalizeSubject,
  normalizeConfig,
  migrateGamesConfig,
  toLegacyTaskConfig,
};
