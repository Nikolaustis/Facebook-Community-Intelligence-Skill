'use strict';

function norm(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function latinNumericOnly(s) {
  return /^[a-z0-9 ]+$/i.test(s);
}

function containsPhrase(textValue, phraseValue) {
  const text = norm(textValue);
  const phrase = norm(phraseValue);
  if (!text || !phrase) return false;
  if (!latinNumericOnly(phrase)) return text.includes(phrase);
  const tokens = phrase.split(' ').filter(Boolean).map(escapeRegExp);
  const inner = tokens.join('[\\s\\p{P}\\p{S}_-]*');
  const re = new RegExp(`(^|[^a-z0-9])${inner}(?=$|[^a-z0-9])`, 'iu');
  return re.test(text);
}

function matchingTerms(text, values) {
  return (values || []).filter((value) => containsPhrase(text, value));
}

function evaluateCommunitySubject({ community_name, source_queries = [], is_seed = false }, subject) {
  const name = community_name || '';
  const canonical = containsPhrase(name, subject.subject_name);
  const aliasMatches = matchingTerms(name, subject.aliases);
  const siblingMatches = matchingTerms(name, subject.relationships.mutually_exclusive);

  const blockingSibling = siblingMatches.find((sibling) =>
    containsPhrase(sibling, subject.subject_name) &&
    norm(sibling) !== norm(subject.subject_name)
  );

  if (is_seed) {
    return { status: 'accepted', match_type: 'seed', confidence: 1.0, evidence: ['seed_group_url'] };
  }
  if (blockingSibling && canonical) {
    return {
      status: 'rejected',
      match_type: 'mutually_exclusive',
      confidence: 0.98,
      evidence: [`blocking:${blockingSibling}`],
    };
  }
  if (canonical) {
    return { status: 'accepted', match_type: 'canonical', confidence: 0.96, evidence: [subject.subject_name] };
  }
  if (aliasMatches.length) {
    return { status: 'accepted', match_type: 'alias', confidence: 0.91, evidence: aliasMatches };
  }
  const queryMatches = source_queries.filter((query) =>
    containsPhrase(name, query) || containsPhrase(query, subject.subject_name)
  );
  if (queryMatches.length) {
    return { status: 'review', match_type: 'source_query', confidence: 0.74, evidence: queryMatches };
  }
  const rootMatches = matchingTerms(name, subject.ip_roots);
  if (rootMatches.length) {
    return { status: 'review', match_type: 'ip_root', confidence: 0.55, evidence: rootMatches };
  }
  if (siblingMatches.length) {
    return {
      status: 'rejected',
      match_type: 'mutually_exclusive',
      confidence: 0.97,
      evidence: siblingMatches,
    };
  }
  return { status: 'rejected', match_type: 'no_match', confidence: 0.90, evidence: [] };
}

module.exports = { norm, containsPhrase, evaluateCommunitySubject };
