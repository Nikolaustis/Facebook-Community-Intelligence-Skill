'use strict';

const assert = require('assert');
const { phraseMatches, classifyCandidate } = require('../phase15_name_prefilter');

const positives = [
  ['Sailor Piece水手寶石中文交易討論區', 'Sailor Piece'],
  ['All Star Tower Defenseซื้อขายแลกเปลี่ยน', 'All Star Tower Defense'],
  ['Pet Simulator 99中文讨论/交易群', 'Pet Simulator 99'],
  ['ซื้อขายAll Star Tower Defense', 'All Star Tower Defense'],
  ['All\u200B Star\u200B Tower\u200B Defenseซื้อขาย', 'All Star Tower Defense'],
  ['GAG中文交易群', 'GAG'],
];
const negatives = [
  ['Sailor Pieces - Roblox -VN', 'Sailor Piece'],
  ['Sailor PieceMN', 'Sailor Piece'],
  ['All Star Tower DefenseX', 'All Star Tower Defense'],
  ['Pet Simulator 99100', 'Pet Simulator 99'],
  ['GAGS', 'GAG'],
  ['GAGGED', 'GAG'],
  ['GAG2 Indonesia', 'GAG'],
  ['9GAG', 'GAG'],
];
let cases = 0;
for (const [text, phrase] of positives) {
  assert.ok(phraseMatches(text, phrase), `expected match: ${text} / ${phrase}`);
  cases++;
}
for (const [text, phrase] of negatives) {
  assert.ok(!phraseMatches(text, phrase), `expected no match: ${text} / ${phrase}`);
  cases++;
}

const profile = {
  game_name: 'Sailor Piece',
  target_phrases: ['Sailor Piece'],
  sibling_phrases: ['Sailor Piece 2', 'Blox Fruits'],
};
const kept = classifyCandidate({ group_name: 'Sailor Piece中文交易群' }, profile, { keep_sibling_only_for_manual_review: false });
assert.strictEqual(kept.decision, 'keep_strong_name_match');
assert.strictEqual(kept.boundary_mode, 'latin_script_transition');
cases += 2;
const rejected = classifyCandidate({ group_name: 'Blox Fruits Community' }, profile, { keep_sibling_only_for_manual_review: false });
assert.strictEqual(rejected.decision, 'reject_sibling_only');
cases++;

console.log(JSON.stringify({ ok: true, version: '7.2.0', cases }, null, 2));
