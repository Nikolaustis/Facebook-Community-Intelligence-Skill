'use strict';

const assert = require('assert');
const { FacebookGroupsAdapter, normalizeValidatedRow } = require('../src/sources/facebook_groups');

const adapter = new FacebookGroupsAdapter();
assert.strictEqual(adapter.source_id, 'facebook_groups');
const row = normalizeValidatedRow({
  'Group URL': 'https://www.facebook.com/groups/example/?ref=share',
  'Group Name': 'Acme Community',
  Game: 'Acme',
  Members: '12,345',
});
assert.strictEqual(row.group_url, 'https://www.facebook.com/groups/example');
assert.strictEqual(row.subject_name, 'Acme');
assert.strictEqual(row.members, 12345);
console.log('facebook source adapter checks passed');
