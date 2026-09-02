'use strict';

const FORMAT_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;

function cleanText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(FORMAT_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUFFIX_RULES = [
  { id: 'zh_avatar', re: /\s*(?:的(?:头像|頭像)(?:照片)?|的大头贴|的大頭貼)\s*$/iu },
  { id: 'ja_profile_picture', re: /\s*のプロフィール(?:写真|画像)\s*$/iu },
  { id: 'ko_profile_picture', re: /\s*(?:님)?의\s*프로필\s*(?:사진|이미지)\s*$/iu },
  { id: 'en_profile_picture_possessive', re: /\s*['’]s\s*(?:profile\s*(?:picture|photo|image)|group\s*(?:picture|photo)|avatar)\s*$/iu },
  { id: 'en_profile_picture_label', re: /\s*(?:profile\s*(?:picture|photo|image)|group\s*(?:picture|photo))\s*$/iu },
  { id: 'vi_profile_picture', re: /\s*(?:là\s*)?ảnh\s*(?:đại\s*diện|hồ\s*sơ)\s*$/iu },
  { id: 'th_profile_picture', re: /\s*(?:รูปโปรไฟล์|รูปภาพโปรไฟล์|รูปประจำตัว)\s*$/iu },
  { id: 'id_profile_picture', re: /\s*(?:foto|gambar)\s*profil\s*$/iu },
  { id: 'ms_profile_picture', re: /\s*(?:foto|gambar)\s*profil\s*$/iu },
  { id: 'es_profile_picture', re: /\s*(?:foto|imagen)\s*(?:del\s*)?perfil\s*$/iu },
  { id: 'pt_profile_picture', re: /\s*(?:foto|imagem)\s*(?:do\s*)?perfil\s*$/iu },
  { id: 'fr_profile_picture', re: /\s*(?:photo|image)\s*de\s*profil\s*$/iu },
  { id: 'de_profile_picture', re: /\s*profilbild\s*$/iu },
  { id: 'ru_profile_picture', re: /\s*(?:фото|изображение)\s*профиля\s*$/iu },
  { id: 'ar_profile_picture', re: /\s*صورة\s*الملف\s*الشخصي\s*$/iu },
];

const ARIA_PREFIX_RULES = [
  { id: 'en_profile_picture_of', re: /^(?:profile\s*(?:picture|photo|image)|group\s*(?:picture|photo)|avatar)\s+(?:of|for)\s+/iu },
  { id: 'zh_profile_picture_of', re: /^(?:头像|頭像|头像照片|頭像照片|个人资料照片|個人資料相片)\s*[:：]?\s*/u },
  { id: 'ja_profile_picture_of', re: /^プロフィール(?:写真|画像)\s*[:：]?\s*/u },
  { id: 'ko_profile_picture_of', re: /^프로필\s*(?:사진|이미지)\s*[:：]?\s*/u },
  { id: 'vi_profile_picture_of', re: /^ảnh\s*(?:đại\s*diện|hồ\s*sơ)\s+của\s+/iu },
  { id: 'th_profile_picture_of', re: /^(?:รูปโปรไฟล์|รูปภาพโปรไฟล์|รูปประจำตัว)\s*(?:ของ)?\s*/iu },
  { id: 'id_profile_picture_of', re: /^(?:foto|gambar)\s*profil\s+(?:dari\s+)?/iu },
  { id: 'es_profile_picture_of', re: /^(?:foto|imagen)\s*(?:del\s*)?perfil\s+de\s+/iu },
  { id: 'pt_profile_picture_of', re: /^(?:foto|imagem)\s*(?:do\s*)?perfil\s+de\s+/iu },
  { id: 'fr_profile_picture_of', re: /^(?:photo|image)\s*de\s*profil\s+de\s+/iu },
  { id: 'de_profile_picture_of', re: /^profilbild\s+(?:von\s+)?/iu },
  { id: 'ru_profile_picture_of', re: /^(?:фото|изображение)\s*профиля\s+/iu },
  { id: 'ar_profile_picture_of', re: /^صورة\s*الملف\s*الشخصي\s*(?:لـ|ل)?\s*/iu },
];

function sanitizeGroupName(value, options = {}) {
  const rawName = cleanText(value);
  let name = rawName;
  const reasons = [];
  const source = String(options.source || '').toLowerCase();
  const allowPrefix = options.allowPrefix === true || source.includes('aria') || source.includes('alt');

  if (allowPrefix) {
    for (const rule of ARIA_PREFIX_RULES) {
      if (rule.re.test(name)) {
        name = cleanText(name.replace(rule.re, ''));
        reasons.push(rule.id);
        break;
      }
    }
  }

  let removed = true;
  while (removed && name) {
    removed = false;
    for (const rule of SUFFIX_RULES) {
      if (rule.re.test(name)) {
        const next = cleanText(name.replace(rule.re, ''));
        if (next && next !== name) {
          name = next;
          reasons.push(rule.id);
          removed = true;
          break;
        }
      }
    }
  }

  // Facebook sometimes duplicates the label after accessibility text extraction.
  const duplicate = name.match(/^(.{2,120}?)\s+[·|｜-]\s*\1$/iu);
  if (duplicate) {
    name = cleanText(duplicate[1]);
    reasons.push('duplicate_accessibility_label');
  }

  return {
    raw_name: rawName,
    clean_name: name,
    changed: Boolean(rawName && name !== rawName),
    reasons,
  };
}

function normalizedNameKey(value) {
  return cleanText(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactNameKey(value) {
  return normalizedNameKey(value).replace(/\s+/g, '');
}

function isGenericOrUiName(value) {
  const name = cleanText(value);
  if (!name || name.length < 2 || name.length > 220) return true;
  if (/^(?:facebook|meta|groups?|group|home|about|discussion|members?|posts?|photos?|videos?|files?|events?|简介|簡介|讨论|討論|成员|成員|帖子|貼文)$/iu.test(name)) return true;
  if (/^(?:public|private|visible|hidden|公开|公開|私密)\s*[·•|｜-]?\s*\d*/iu.test(name)) return true;
  if (/^(?:\d+(?:[.,]\d+)?\s*(?:k|m|万)?\s*(?:members?|位成员|位成員|thành viên|สมาชิก)?)$/iu.test(name)) return true;
  return false;
}

const SOURCE_WEIGHTS = {
  about_h1: 140,
  about_heading: 135,
  about_document_title: 125,
  visible_heading: 120,
  visible_anchor: 110,
  same_url_visible_anchor: 108,
  card_heading: 105,
  card_text: 92,
  title_attribute: 80,
  image_alt: 58,
  aria_label: 35,
  unknown: 50,
};

function sourceWeight(source) {
  return SOURCE_WEIGHTS[String(source || '').toLowerCase()] ?? SOURCE_WEIGHTS.unknown;
}

function scoreNameCandidate(candidate) {
  const source = String(candidate && candidate.source || 'unknown').toLowerCase();
  const sanitized = sanitizeGroupName(candidate && candidate.value, {
    source,
    allowPrefix: source.includes('aria') || source.includes('alt'),
  });
  const name = sanitized.clean_name;
  if (isGenericOrUiName(name)) return { ...candidate, ...sanitized, score: -9999 };

  let score = sourceWeight(source);
  const length = Array.from(name).length;
  if (length >= 4 && length <= 120) score += 15;
  if (length > 180) score -= 50;
  if (/members?|位成员|位成員|thành viên|สมาชิก|公开|公開|私密/u.test(name)) score -= 60;
  if (sanitized.changed && source.includes('aria')) score -= 8;
  if (/^(?:profile|photo|avatar|图片|圖片|照片|头像|頭像)/iu.test(name)) score -= 30;
  if (candidate && candidate.same_url) score += 8;
  return { ...candidate, ...sanitized, score };
}

function chooseBestNameCandidate(candidates) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map(scoreNameCandidate)
    .filter((x) => x.clean_name && x.score > -9000)
    .sort((a, b) => b.score - a.score || b.clean_name.length - a.clean_name.length);
  return scored[0] || null;
}

function namesRoughlyAgree(a, b) {
  const ak = compactNameKey(a);
  const bk = compactNameKey(b);
  if (!ak || !bk) return false;
  if (ak === bk || ak.includes(bk) || bk.includes(ak)) return true;
  const at = new Set(normalizedNameKey(a).split(' ').filter(Boolean));
  const bt = new Set(normalizedNameKey(b).split(' ').filter(Boolean));
  const overlap = [...at].filter((x) => bt.has(x)).length;
  return overlap >= Math.min(2, at.size, bt.size);
}

function choosePhase2GroupName({ phase1Name, phase1Source, aboutName, aboutSource }) {
  const p1 = scoreNameCandidate({ value: phase1Name, source: phase1Source || 'unknown' });
  const about = scoreNameCandidate({ value: aboutName, source: aboutSource || 'about_h1' });
  const p1Valid = p1.clean_name && p1.score > -9000;
  const aboutValid = about.clean_name && about.score > -9000;

  if (aboutValid) {
    const weakPhase1 = !p1Valid || String(phase1Source || '').toLowerCase().includes('aria') || p1.changed;
    if (weakPhase1 || namesRoughlyAgree(p1.clean_name, about.clean_name) || about.score >= p1.score + 10) {
      return {
        group_name: about.clean_name,
        source: about.source || 'about_h1',
        raw_group_name: about.raw_name,
        normalization_reasons: about.reasons,
        phase1_clean_name: p1.clean_name || '',
        about_clean_name: about.clean_name,
      };
    }
  }

  if (p1Valid) {
    return {
      group_name: p1.clean_name,
      source: p1.source || 'phase1',
      raw_group_name: p1.raw_name,
      normalization_reasons: p1.reasons,
      phase1_clean_name: p1.clean_name,
      about_clean_name: aboutValid ? about.clean_name : '',
    };
  }

  if (aboutValid) {
    return {
      group_name: about.clean_name,
      source: about.source || 'about_h1',
      raw_group_name: about.raw_name,
      normalization_reasons: about.reasons,
      phase1_clean_name: '',
      about_clean_name: about.clean_name,
    };
  }

  return {
    group_name: '',
    source: '',
    raw_group_name: '',
    normalization_reasons: [],
    phase1_clean_name: '',
    about_clean_name: '',
  };
}

module.exports = {
  cleanText,
  sanitizeGroupName,
  normalizedNameKey,
  compactNameKey,
  isGenericOrUiName,
  scoreNameCandidate,
  chooseBestNameCandidate,
  choosePhase2GroupName,
  namesRoughlyAgree,
};
