'use strict';

const assert = require('assert');
const { CommunityStore, canonicalizeFacebookGroupUrl } = require('../src/store/community_store');
const { EvidenceStore } = require('../src/store/evidence_store');

assert.strictEqual(
  canonicalizeFacebookGroupUrl('https://www.facebook.com/groups/12345/?ref=share'),
  'https://www.facebook.com/groups/12345',
);

const store = new CommunityStore();
const a = store.upsert({ group_url: 'https://www.facebook.com/groups/12345/', group_name: 'One', members: 100 });
const b = store.upsert({ group_url: 'https://www.facebook.com/groups/12345?x=1', region: 'TH' });
assert.strictEqual(a.community_id, b.community_id);
assert.strictEqual(store.values().length, 1);
assert.strictEqual(store.values()[0].region, 'TH');

const evidence = new EvidenceStore();
evidence.add({ community_id: a.community_id, evidence_type: 'members', value: 100 });
evidence.add({ community_id: a.community_id, evidence_type: 'members', value: 100 });
assert.strictEqual(evidence.values().length, 1);
console.log('community/evidence reuse checks passed');
