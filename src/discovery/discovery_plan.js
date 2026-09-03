'use strict';

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDiscoveryPlan(subjects) {
  const plans = subjects.map((subject) => {
    const queries = [
      { query: subject.subject_name, type: 'canonical' },
      ...subject.aliases.map((query) => ({ query, type: 'alias' })),
      ...subject.discovery.search_variants,
    ];
    return {
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      subject_type: subject.subject_type,
      queries: dedupe(queries, (x) => x.query.normalize('NFKC').toLowerCase()),
      seed_group_urls: dedupe(subject.discovery.seed_group_urls || [], (x) => x.toLowerCase()),
    };
  });

  const uniqueSeedCommunities = dedupe(
    plans.flatMap((plan) => plan.seed_group_urls.map((url) => ({ url, subject_id: plan.subject_id }))),
    (x) => x.url.toLowerCase(),
  );

  return {
    subject_count: subjects.length,
    plans,
    unique_seed_community_count: uniqueSeedCommunities.length,
    unique_seed_communities: uniqueSeedCommunities,
  };
}

module.exports = { buildDiscoveryPlan };
