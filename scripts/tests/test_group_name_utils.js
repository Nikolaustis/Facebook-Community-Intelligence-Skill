'use strict';

const assert = require('assert');
const {
  sanitizeGroupName,
  chooseBestNameCandidate,
  choosePhase2GroupName,
} = require('../group_name_utils');

const cases = [
  ['One Piece Bounty Rush Malaysia 🇲🇾的头像', 'One Piece Bounty Rush Malaysia 🇲🇾'],
  ['Seven Knights Re:Birth (Global)的頭像', 'Seven Knights Re:Birth (Global)'],
  ['Sailor Pieceのプロフィール写真', 'Sailor Piece'],
  ['All Star Tower Defense님의 프로필 사진', 'All Star Tower Defense'],
  ["Pet Simulator 99's profile picture", 'Pet Simulator 99'],
  ['Ảnh đại diện của Sailor Piece', 'Sailor Piece', 'aria_label'],
  ['รูปโปรไฟล์ของ All Star Tower Defense', 'All Star Tower Defense', 'aria_label'],
  ['Foto del perfil de Pet Simulator 99', 'Pet Simulator 99', 'aria_label'],
  ['All\u200B Star\u200B Tower\u200B Defense的头像', 'All Star Tower Defense'],
];

let checks = 0;
for (const [input, expected, source = 'legacy_xlsx'] of cases) {
  const got = sanitizeGroupName(input, { source, allowPrefix: source === 'aria_label' });
  assert.strictEqual(got.clean_name, expected, `${input} -> ${got.clean_name}`);
  checks++;
}

assert.strictEqual(sanitizeGroupName('Avatar Trading', { source: 'visible_heading' }).clean_name, 'Avatar Trading');
checks++;

const best = chooseBestNameCandidate([
  { value: 'One Piece Bounty Rush Malaysia 🇲🇾的头像', source: 'aria_label' },
  { value: 'One Piece Bounty Rush Malaysia 🇲🇾', source: 'visible_heading' },
]);
assert.strictEqual(best.clean_name, 'One Piece Bounty Rush Malaysia 🇲🇾');
assert.strictEqual(best.source, 'visible_heading');
checks += 2;

const selected = choosePhase2GroupName({
  phase1Name: 'ONE PIECE BOUNTY RUSH-[Trade & Giveway]🔥的头像',
  phase1Source: 'aria_label',
  aboutName: 'ONE PIECE BOUNTY RUSH-[Trade & Giveway]🔥',
  aboutSource: 'about_h1',
});
assert.strictEqual(selected.group_name, 'ONE PIECE BOUNTY RUSH-[Trade & Giveway]🔥');
assert.strictEqual(selected.source, 'about_h1');
checks += 2;

console.log(JSON.stringify({ ok: true, version: '7.2.0', checks }, null, 2));
