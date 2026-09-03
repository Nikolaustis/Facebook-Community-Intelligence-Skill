'use strict';

const assert = require('assert');
const {
  parseCompactNumber,
  parseMemberCount,
  parseGroupSize,
  parseTodayPosts,
  parseWeekNewFans,
  parseExistedLastMonth,
} = require('../scripts/facebook_metrics_parser');

assert.strictEqual(parseCompactNumber('1,234'), 1234);
assert.strictEqual(parseCompactNumber('1.2K'), 1200);
assert.strictEqual(parseCompactNumber('1,2K'), 1200);
assert.strictEqual(parseCompactNumber('2.5M'), 2500000);
assert.strictEqual(parseCompactNumber('1.3万'), 13000);

const groupCases = [
  ['12.4K members', 12400],
  ['1.2M members', 1200000],
  ['群组规模：1.3万位成员', 13000],
  ['8,451 thành viên', 8451],
  ['5.6K miembros', 5600],
  ['7,210 membros', 7210],
  ['3.4K anggota', 3400],
  ['สมาชิกทั้งหมด: 9.1K คน', 9100],
  ['2.2K Mitglieder', 2200],
  ['1.8K メンバー', 1800],
  ['회원 4.5K', 4500],
  ['6.7K أعضاء', 6700],
];
for (const [text, expected] of groupCases) {
  assert.strictEqual(parseGroupSize(text), expected, `group size failed for: ${text}`);
  assert.strictEqual(parseMemberCount(text), expected, `member count failed for: ${text}`);
}

// Group-size parsing should prefer the actual larger membership count over weekly growth.
assert.strictEqual(parseGroupSize('12 new members in the last week · 3.4K members'), 3400);

const todayCases = [
  ["Today's new posts: 18", 18],
  ['今日新帖：23', 23],
  ['bài viết mới hôm nay: 14', 14],
  ['โพสต์ใหม่วันนี้: 11', 11],
  ['publicaciones nuevas hoy: 17', 17],
  ['novas publicações hoje: 19', 19],
  ['postingan baru hari ini: 21', 21],
  ["nouvelles publications aujourd'hui: 13", 13],
  ['neue Beiträge heute: 12', 12],
  ['今日の新しい投稿: 16', 16],
  ['오늘 새 게시물: 15', 15],
  ['منشورات جديدة اليوم: 10', 10],
];
for (const [text, expected] of todayCases) {
  assert.strictEqual(parseTodayPosts(text), expected, `today posts failed for: ${text}`);
}

const weekCases = [
  ['New members in the last week: +45', 45],
  ['上周新增成员：+31', 31],
  ['thành viên mới tuần trước: 28', 28],
  ['nuevos miembros la semana pasada: 36', 36],
  ['novos membros na última semana: 42', 42],
  ['anggota baru minggu lalu: 24', 24],
  ['nouveaux membres la semaine dernière: 27', 27],
  ['neue Mitglieder in der letzten Woche: 33', 33],
  ['先週の新しいメンバー: 22', 22],
  ['지난 주 새 회원: 26', 26],
  ['أعضاء جدد في الأسبوع الماضي: 29', 29],
  ['สมาชิกใหม่สัปดาห์ที่แล้ว: 25', 25],
];
for (const [text, expected] of weekCases) {
  assert.strictEqual(parseWeekNewFans(text), expected, `week new members failed for: ${text}`);
}

assert.strictEqual(parseExistedLastMonth('Last month there were posts in this group'), 'yes');
assert.strictEqual(parseExistedLastMonth('This group did not exist last month'), 'no');
assert.strictEqual(parseExistedLastMonth('上月有发帖记录'), 'yes');
assert.strictEqual(parseExistedLastMonth('上个月不存在'), 'no');
assert.strictEqual(parseExistedLastMonth('No evidence'), '');

console.log('facebook metrics parser tests passed');
