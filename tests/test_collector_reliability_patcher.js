'use strict';

const assert = require('assert');
const {
  patchPhase1Source,
  patchPhase2Source,
} = require('../scripts/collector_reliability_patcher');

const phase1Fixture = `
const { sanitizeGroupName, scoreNameCandidate, chooseBestNameCandidate } = require('./group_name_utils');
function parseMemberCount(text) {
  return '';
}
const x = parseMemberCount('1K members');
`;
const p1 = patchPhase1Source(phase1Fixture);
assert(p1.includes("const { parseMemberCount } = require('./facebook_metrics_parser');"));
assert(p1.includes('function parseMemberCountLegacy(text)'));
assert(p1.includes("const x = parseMemberCount('1K members');"));

const phase2Fixture = `
const { sanitizeGroupName, choosePhase2GroupName, chooseBestNameCandidate } = require('./group_name_utils');
function extractGroupSize(aboutText) { return ''; }
function extractTodayPosts(aboutText) { return ''; }
function extractWeekNewFans(aboutText) { return ''; }
function extractExistedLastMonth(aboutText) { return ''; }
async function x() {
        const cardMembers = toInt(c.card_group_size);
        if (!(typeof cardMembers === 'number' && Number.isFinite(cardMembers) && cardMembers >= 100)) {
          stats.skipped_card_lt_100++;
          markCandidateCheckpoint('skipped_card_lt_100');
          continue;
        }
          if (aboutCacheKey) aboutCache.set(aboutCacheKey, about);
          if (aboutCacheKey) discussionLanguageCache.set(aboutCacheKey, discussionLanguage);
}
`;
const p2 = patchPhase2Source(phase2Fixture);
assert(p2.includes('parseGroupSize: extractGroupSize'));
assert(p2.includes('function extractGroupSizeLegacy(aboutText)'));
assert(p2.includes('if (cardMembersKnown && cardMembers < 100)'));
assert(p2.includes('card_size_unknown_forwarded_to_about'));
assert(p2.includes('aboutCacheKey && about && about.ok'));
assert(p2.includes('discussionLanguage && discussionLanguage.ok'));

assert.throws(
  () => patchPhase2Source('const unrelated = true;'),
  /expected source marker was not found/,
  'patcher must fail closed when upstream source changes',
);

console.log('collector reliability patcher tests passed');
