'use strict';

const PHASE1_IMPORT_ANCHOR = "const { sanitizeGroupName, scoreNameCandidate, chooseBestNameCandidate } = require('./group_name_utils');";
const PHASE2_IMPORT_ANCHOR = "const { sanitizeGroupName, choosePhase2GroupName, chooseBestNameCandidate } = require('./group_name_utils');";

function assertContains(source, marker, label) {
  if (!source.includes(marker)) {
    throw new Error(`[reliability-patcher] ${label}: expected source marker was not found. Upstream code may have changed; refusing to run an unverified patch.`);
  }
}

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) {
    throw new Error(`[reliability-patcher] ${label}: source pattern not found.`);
  }
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`[reliability-patcher] ${label}: source pattern is no longer unique; refusing an ambiguous patch.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function renameFunction(source, oldName, newName, label) {
  return replaceExactlyOnce(
    source,
    `function ${oldName}(`,
    `function ${newName}(`,
    label || `rename ${oldName}`,
  );
}

function patchPhase1Source(source) {
  assertContains(source, PHASE1_IMPORT_ANCHOR, 'phase1 import anchor');
  assertContains(source, 'function parseMemberCount(text) {', 'phase1 legacy member parser');

  let patched = replaceExactlyOnce(
    source,
    PHASE1_IMPORT_ANCHOR,
    `${PHASE1_IMPORT_ANCHOR}\nconst { parseMemberCount } = require('./facebook_metrics_parser');`,
    'phase1 metrics parser import',
  );
  patched = renameFunction(patched, 'parseMemberCount', 'parseMemberCountLegacy', 'phase1 legacy parser rename');
  return patched;
}

function patchPhase2Source(source) {
  assertContains(source, PHASE2_IMPORT_ANCHOR, 'phase2 import anchor');
  for (const fn of ['extractGroupSize', 'extractTodayPosts', 'extractWeekNewFans', 'extractExistedLastMonth']) {
    assertContains(source, `function ${fn}(`, `phase2 legacy function ${fn}`);
  }

  let patched = replaceExactlyOnce(
    source,
    PHASE2_IMPORT_ANCHOR,
    `${PHASE2_IMPORT_ANCHOR}\nconst {\n  parseGroupSize: extractGroupSize,\n  parseTodayPosts: extractTodayPosts,\n  parseWeekNewFans: extractWeekNewFans,\n  parseExistedLastMonth: extractExistedLastMonth,\n} = require('./facebook_metrics_parser');`,
    'phase2 metrics parser import',
  );

  patched = renameFunction(patched, 'extractGroupSize', 'extractGroupSizeLegacy');
  patched = renameFunction(patched, 'extractTodayPosts', 'extractTodayPostsLegacy');
  patched = renameFunction(patched, 'extractWeekNewFans', 'extractWeekNewFansLegacy');
  patched = renameFunction(patched, 'extractExistedLastMonth', 'extractExistedLastMonthLegacy');

  const oldCardGate = `        const cardMembers = toInt(c.card_group_size);\n        if (!(typeof cardMembers === 'number' && Number.isFinite(cardMembers) && cardMembers >= 100)) {\n          stats.skipped_card_lt_100++;\n          markCandidateCheckpoint('skipped_card_lt_100');\n          continue;\n        }`;
  const newCardGate = `        const cardMembers = toInt(c.card_group_size);\n        const cardMembersKnown = typeof cardMembers === 'number' && Number.isFinite(cardMembers);\n        if (!cardMembersKnown) {\n          stats.card_size_unknown_forwarded_to_about = (stats.card_size_unknown_forwarded_to_about || 0) + 1;\n        }\n        // Only a known card size below 100 is safe to reject before opening About.\n        // Missing/unparsed card metrics are inconclusive and must continue to page validation.\n        if (cardMembersKnown && cardMembers < 100) {\n          stats.skipped_card_lt_100++;\n          markCandidateCheckpoint('skipped_card_lt_100');\n          continue;\n        }`;
  patched = replaceExactlyOnce(patched, oldCardGate, newCardGate, 'phase2 unknown card-size gate');

  patched = replaceExactlyOnce(
    patched,
    '          if (aboutCacheKey) aboutCache.set(aboutCacheKey, about);',
    '          if (aboutCacheKey && about && about.ok) aboutCache.set(aboutCacheKey, about);',
    'phase2 About success-only cache',
  );

  if (patched.includes('          if (aboutCacheKey) discussionLanguageCache.set(aboutCacheKey, discussionLanguage);')) {
    patched = replaceExactlyOnce(
      patched,
      '          if (aboutCacheKey) discussionLanguageCache.set(aboutCacheKey, discussionLanguage);',
      '          if (aboutCacheKey && discussionLanguage && discussionLanguage.ok) discussionLanguageCache.set(aboutCacheKey, discussionLanguage);',
      'phase2 discussion success-only cache',
    );
  }

  return patched;
}

function patchCollectorSource(mode, source) {
  if (mode === 'phase1') return patchPhase1Source(source);
  if (mode === 'phase2') return patchPhase2Source(source);
  throw new Error(`[reliability-patcher] unsupported collector mode: ${mode}`);
}

module.exports = {
  patchCollectorSource,
  patchPhase1Source,
  patchPhase2Source,
  replaceExactlyOnce,
};
