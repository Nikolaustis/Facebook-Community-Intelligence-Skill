'use strict';

const assert = require('assert');
const { chooseBestNameCandidate, sanitizeGroupName } = require('../group_name_utils');

let checks = 0;
const candidate = chooseBestNameCandidate([
  { value: '', source: 'visible_anchor' },
  { value: 'One Piece Bounty Rush Malaysia 🇲🇾的头像', source: 'aria_label', same_url: true },
]);
assert.strictEqual(candidate.clean_name, 'One Piece Bounty Rush Malaysia 🇲🇾');
assert.strictEqual(candidate.source, 'aria_label');
checks += 2;

const visibleWins = chooseBestNameCandidate([
  { value: 'One Piece Bounty Rush Malaysia 🇲🇾的头像', source: 'aria_label', same_url: true },
  { value: 'One Piece Bounty Rush Malaysia 🇲🇾', source: 'card_heading', same_url: false },
]);
assert.strictEqual(visibleWins.source, 'card_heading');
checks++;

const hidden = sanitizeGroupName('All\u200B Star\u200B Tower\u200B Defense的头像', { source: 'aria_label' });
assert.strictEqual(hidden.clean_name, 'All Star Tower Defense');
checks++;

console.log(JSON.stringify({ ok: true, checks, version: '7.2.0' }, null, 2));
