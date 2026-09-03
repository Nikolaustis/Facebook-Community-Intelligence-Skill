'use strict';

function clean(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCompactNumber(raw) {
  const value = clean(raw).replace(/\s+/g, '');
  if (!value) return '';

  const m = value.match(/^([0-9]+(?:[.,][0-9]+)?)([kKmMbB]|万|萬|千)?\+?$/u);
  if (!m) return '';

  let numeric = m[1];
  const suffix = m[2] || '';

  // With a compact suffix, comma may be a decimal separator (1,2K).
  if (suffix && /^\d+,\d{1,2}$/.test(numeric)) {
    numeric = numeric.replace(',', '.');
  } else {
    numeric = numeric.replace(/,/g, '');
  }

  const n = Number(numeric);
  if (!Number.isFinite(n)) return '';

  const multiplier = suffix === '万' || suffix === '萬'
    ? 10000
    : suffix === '千'
      ? 1000
      : suffix.toLowerCase() === 'k'
        ? 1000
        : suffix.toLowerCase() === 'm'
          ? 1000000
          : suffix.toLowerCase() === 'b'
            ? 1000000000
            : 1;

  return Math.round(n * multiplier);
}

const NUMBER_TOKEN = '([0-9]+(?:[.,][0-9]+)?\\s*(?:[kKmMbB]|万|萬|千)?\\+?)';

function collectMatches(text, regexes, groupIndex = 1) {
  const source = clean(text);
  const values = [];
  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source)) !== null) {
      const parsed = parseCompactNumber(match[groupIndex]);
      if (parsed !== '' && Number.isFinite(parsed)) values.push(parsed);
      if (!regex.global) break;
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }
  return values;
}

function firstOrBlank(values) {
  return values.length ? values[0] : '';
}

function maxOrBlank(values) {
  return values.length ? Math.max(...values) : '';
}

function labelRegex(label, options = {}) {
  const escaped = options.raw ? label : escapeRegExp(label);
  const flags = `giu`;
  if (options.numberFirst) {
    return new RegExp(`${NUMBER_TOKEN}\\s*(?:${escaped})`, flags);
  }
  return new RegExp(`(?:${escaped})\\s*[:：+\-–—]?\\s*${NUMBER_TOKEN}`, flags);
}

const GROUP_SIZE_NUMBER_FIRST_LABELS = [
  'members?', '位?成员', '位?成員', 'thành\\s*viên', 'miembros?', 'membros?', 'anggota',
  'ahli', 'miyembro', 'membres?', 'Mitglieder', 'membri', 'leden', 'członk(?:owie|ów|ow)',
  'üyeler?', 'uyeler?', 'участник(?:ов|а|и)?', 'подписчик(?:ов|а|и)?', 'メンバー', '회원',
  'أعضاء|عضو|الأعضاء', 'اعضاء', 'सदस्य', 'สมาชิก(?:ทั้งหมด)?(?:\\s*คน)?',
];

const GROUP_SIZE_LABEL_FIRST = [
  'group\\s*size', 'members?', '成员(?:人数|數)?', '成員(?:人數|數)?', 'thành\\s*viên',
  'miembros?', 'membros?', 'anggota', 'ahli', 'miyembro', 'membres?', 'Mitglieder', 'membri',
  'leden', 'członk(?:owie|ów|ow)', 'üyeler?', 'uyeler?', 'участник(?:ов|а|и)?', 'メンバー', '회원',
  'أعضاء|الأعضاء', 'اعضاء', 'सदस्य', 'สมาชิก(?:ทั้งหมด)?',
];

function parseGroupSize(text) {
  const regexes = [
    new RegExp(`(?:group\\s*size|群组规模|群組規模|小组规模|小組規模)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`, 'giu'),
  ];

  for (const label of GROUP_SIZE_NUMBER_FIRST_LABELS) regexes.push(labelRegex(label, { raw: true, numberFirst: true }));
  for (const label of GROUP_SIZE_LABEL_FIRST) regexes.push(labelRegex(label, { raw: true, numberFirst: false }));

  // A group page can also contain "new members" counts. The actual group-size count is
  // normally the largest membership-shaped number, so take the maximum rather than the
  // first arbitrary match in body text.
  return maxOrBlank(collectMatches(text, regexes));
}

function parseMemberCount(text) {
  return parseGroupSize(text);
}

const TODAY_POST_PATTERNS = [
  `(?:today'?s?\\s+new\\s+posts?|new\\s+posts?\\s+today|posts?\\s+today)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `${NUMBER_TOKEN}\\s*(?:new\\s+posts?\\s+today|posts?\\s+today)`,
  `(?:今日新帖|今天新帖|今日新貼文|今天新貼文|今日贴文|今天贴文)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `${NUMBER_TOKEN}\\s*(?:篇|則|则)?\\s*(?:今日新帖|今天新帖|今日新貼文|今天新貼文)`,
  `(?:bài\\s*viết\\s*mới\\s*hôm\\s*nay|bai\\s*viet\\s*moi\\s*hom\\s*nay)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:โพสต์ใหม่วันนี้|โพสต์วันนี้)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:publicaciones?\\s+nuevas?\\s+hoy|publicaciones?\\s+de\\s+hoy)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:novas?\\s+publica(?:ç|c)[oõ]es?\\s+hoje|publica(?:ç|c)[oõ]es?\\s+de\\s+hoje)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:posting(?:an)?\\s+baru\\s+hari\\s+ini|postingan\\s+hari\\s+ini)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:siaran\\s+baharu\\s+hari\\s+ini|kiriman\\s+baharu\\s+hari\\s+ini)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:nouvelles?\\s+publications?\\s+aujourd['’]?hui|publications?\\s+aujourd['’]?hui)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:neue\\s+beitr[aä]ge\\s+heute|beitr[aä]ge\\s+heute)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:nuovi\\s+post\\s+oggi|post\\s+di\\s+oggi)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:nieuwe\\s+berichten\\s+vandaag|berichten\\s+vandaag)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:nowe\\s+posty\\s+dzisiaj|posty\\s+dzisiaj)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:bugünkü\\s+yeni\\s+gönderiler|bugunku\\s+yeni\\s+gonderiler)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:новые\\s+публикации\\s+сегодня|публикации\\s+сегодня)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:今日の新しい投稿|今日の投稿)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:오늘\\s*새\\s*게시물|오늘의\\s*게시물)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
  `(?:منشورات\\s+جديدة\\s+اليوم|منشورات\\s+اليوم)\\s*[:：–—-]?\\s*${NUMBER_TOKEN}`,
];

function parseTodayPosts(text) {
  const regexes = TODAY_POST_PATTERNS.map((pattern) => new RegExp(pattern, 'giu'));
  return firstOrBlank(collectMatches(text, regexes));
}

const WEEK_NEW_MEMBER_PATTERNS = [
  `(?:new\\s+members?|new\\s+fans?)\\s*(?:in|for)\\s*(?:the\\s*)?(?:last|past)\\s+week\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:last|past)\\s+week\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}\\s*(?:new\\s+members?|new\\s+fans?)`,
  `(?:上周新增粉丝|上周新增粉絲|上周新增成员|上週新增成員|过去7天新增成员|過去7天新增成員)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:thành\\s*viên\\s*mới\\s*(?:trong\\s*)?tuần\\s*(?:trước|qua)|thanh\\s*vien\\s*moi\\s*tuan\\s*(?:truoc|qua))\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:nuevos?\\s+miembros?\\s+(?:la\\s+)?(?:semana\\s+pasada|última\\s+semana|ultima\\s+semana))\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:novos?\\s+membros?\\s+(?:na\\s+)?(?:última\\s+semana|ultima\\s+semana|semana\\s+passada))\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:anggota\\s+baru\\s+(?:minggu\\s+lalu|7\\s+hari\\s+terakhir))\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:ahli\\s+baharu\\s+(?:minggu\\s+lepas|7\\s+hari\\s+lepas))\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:nouveaux?\\s+membres?\\s+(?:la\\s+)?semaine\\s+derni[eè]re)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:neue\\s+mitglieder\\s+(?:in\\s+der\\s+)?letzten\\s+woche)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:nuovi\\s+membri\\s+(?:nell['’]?ultima|la\\s+scorsa)\\s+settimana)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:nieuwe\\s+leden\\s+(?:in\\s+de\\s+)?afgelopen\\s+week)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:nowi\\s+członkowie\\s+(?:w\\s+)?zeszłym\\s+tygodniu)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:geçen\\s+hafta\\s+yeni\\s+üyeler|gecen\\s+hafta\\s+yeni\\s+uyeler)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:новые\\s+участники\\s+за\\s+прошлую\\s+неделю)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:先週の新しいメンバー|過去7日間の新しいメンバー)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:지난\\s*주\\s*새\\s*회원|지난\\s*7일\\s*새\\s*회원)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:أعضاء\\s+جدد\\s+(?:في\\s+)?الأسبوع\\s+الماضي)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
  `(?:สมาชิกใหม่(?:ใน)?สัปดาห์ที่แล้ว)\\s*[:：–—-]?\\s*\\+?\\s*${NUMBER_TOKEN}`,
];

function parseWeekNewFans(text) {
  const regexes = WEEK_NEW_MEMBER_PATTERNS.map((pattern) => new RegExp(pattern, 'giu'));
  return firstOrBlank(collectMatches(text, regexes));
}

const LAST_MONTH_YES = [
  /last\s+month.*posts?|posts?.*last\s+month/iu,
  /上月.*(?:发帖|發帖|贴文|貼文|帖子)/u,
  /tháng\s+trước.*bài\s+viết/iu,
  /mes\s+pasado.*publicaci[oó]n/iu,
  /m[eê]s\s+passado.*publica(?:ç|c)[aã]o/iu,
  /bulan\s+lalu.*posting/iu,
  /mois\s+dernier.*publication/iu,
  /letzten\s+monat.*beitr[aä]g/iu,
  /先月.*投稿/u,
  /지난\s*달.*게시물/u,
  /الشهر\s+الماضي.*منشور/u,
];

const LAST_MONTH_NO = [
  /did\s+not\s+exist\s+last\s+month|not\s+exist\s+last\s+month/iu,
  /上月不(?:存在|存在過)|上个月不存在|上個月不存在/u,
  /kh[oô]ng\s+t[oồ]n\s+t[aạ]i.*th[aá]ng\s+tr[uư][oớ]c/iu,
  /no\s+exist[ií]a.*mes\s+pasado/iu,
  /n[aã]o\s+existia.*m[eê]s\s+passado/iu,
  /先月.*存在しな/u,
  /지난\s*달.*존재하지/u,
];

function parseExistedLastMonth(text) {
  const source = clean(text);
  if (LAST_MONTH_NO.some((re) => re.test(source))) return 'no';
  if (LAST_MONTH_YES.some((re) => re.test(source))) return 'yes';
  return '';
}

module.exports = {
  clean,
  parseCompactNumber,
  parseMemberCount,
  parseGroupSize,
  parseTodayPosts,
  parseWeekNewFans,
  parseExistedLastMonth,
};
