'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeGroupName, cleanText } = require('./group_name_utils');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else { out[key] = next; i++; }
  }
  return out;
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function removeGameTitle(name, gameName) {
  const source = cleanText(name);
  const game = cleanText(gameName);
  if (!game) return source;
  const compactGame = stripDiacritics(game).toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '');
  let residual = source;
  const tokens = game.normalize('NFKC').split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
  if (tokens.length) {
    const body = tokens.map((x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\p{P}\\p{S}\\p{Cf}_]*');
    const re = new RegExp(body, 'igu');
    residual = residual.replace(re, ' ');
  }
  if (compactGame) {
    const compactResidual = stripDiacritics(residual).toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '');
    if (compactResidual === compactGame) residual = '';
  }
  return cleanText(residual);
}

function countMatches(text, re) {
  return (String(text || '').match(re) || []).length;
}

function inferLanguageFromCleanName(groupName, gameName, previousLanguage) {
  const residual = removeGameTitle(groupName, gameName);
  const norm = ` ${stripDiacritics(residual.toLowerCase()).replace(/[^\p{Letter}\p{Number}]+/gu, ' ')} `;
  const thai = countMatches(residual, /[\u0E00-\u0E7F]/g);
  const chinese = countMatches(residual, /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g);
  const latin = countMatches(residual, /[A-Za-z]/g);
  if (thai >= 2) return 'Thai';
  if (/[\u0600-\u06FF]/u.test(residual)) return 'Arabic';
  if (/[\u0900-\u097F]/u.test(residual)) return 'Hindi';
  if (/[\u3040-\u30FF]/u.test(residual)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/u.test(residual)) return 'Korean';
  if (/[\u0E80-\u0EFF]/u.test(residual)) return 'Lao';
  if (/[\u1780-\u17FF]/u.test(residual)) return 'Khmer';
  if (/[\u1000-\u109F]/u.test(residual)) return 'Burmese';
  if (/[\u0400-\u04FF]/u.test(residual)) return 'Russian';
  if (chinese >= 2) return 'Chinese';
  if (/\b(viet nam|vietnam|viet|mua ban|cong dong|trao doi|giao luu)\b/i.test(norm)) return 'Vietnamese';
  if (/\b(espanol|latam|latinoamerica|latin america|america latina|latino|mexico|cambio|venta|ventas|comprar|vender)\b/i.test(norm)) return 'Spanish';
  if (/\b(portugues|brasil|brazil|vendas|trocas|comunidade)\b/i.test(norm)) return 'Portuguese';
  if (/\b(indonesia|indonesian|indo|jual beli|komunitas|akun|kedai)\b/i.test(norm)) return 'Indonesian';
  if (/\b(malaysia|malay|melayu|komuniti)\b/i.test(norm)) return 'Malay';
  if (/\b(philippines|filipino|pinoy|pilipinas|tambayan|\bph\b)\b/i.test(norm)) return 'Filipino';
  if (/\b(francais|francophone|france)\b/i.test(norm)) return 'French';
  if (/\b(arab|arabic)\b/i.test(norm)) return 'Arabic';
  if (/\b(india|indian)\b/i.test(norm)) return 'English';
  if (latin >= 10) return 'English';
  if (previousLanguage && previousLanguage !== 'Chinese') return previousLanguage;
  return 'Unknown';
}

function uniqueSheetName(workbook, base) {
  let name = base.slice(0, 31);
  let i = 2;
  while (workbook.SheetNames.includes(name)) {
    name = `${base.slice(0, Math.max(1, 28 - String(i).length))}_${i}`;
    i++;
  }
  return name;
}

function main() {
  const XLSX = require('xlsx');
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input || '');
  if (!input || !fs.existsSync(input)) {
    console.error('Usage: node scripts/repair_avatar_name_pollution_xlsx.js --input <result.xlsx> [--output <new.xlsx>] [--sheet detail]');
    process.exit(1);
  }
  const parsed = path.parse(input);
  const output = path.resolve(args.output || path.join(parsed.dir, `${parsed.name}_v720_repaired${parsed.ext || '.xlsx'}`));
  if (input === output) throw new Error('Output must be a new file; the repair tool never overwrites the source workbook.');
  const workbook = XLSX.readFile(input, { cellDates: true, cellStyles: true, cellFormula: true });
  const sheetName = args.sheet || (workbook.SheetNames.includes('detail') ? 'detail' : workbook.SheetNames[0]);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (!rows.length) throw new Error(`Worksheet is empty: ${sheetName}`);
  const headers = rows[0].map((x) => cleanText(x));
  const nameIdx = headers.indexOf('group_name');
  const languageIdx = headers.indexOf('language');
  const gameIdx = headers.indexOf('game_name');
  const urlIdx = headers.indexOf('group_url');
  if (nameIdx < 0) throw new Error('group_name column not found.');
  const audit = [['sheet_row', 'game_name', 'group_url', 'old_group_name', 'new_group_name', 'old_language', 'new_language', 'normalization_reasons']];
  let namesChanged = 0;
  let languagesChanged = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const oldName = cleanText(row[nameIdx]);
    if (!oldName) continue;
    const normalized = sanitizeGroupName(oldName, { source: 'legacy_xlsx' });
    if (!normalized.changed) continue;
    const oldLanguage = languageIdx >= 0 ? cleanText(row[languageIdx]) : '';
    const gameName = gameIdx >= 0 ? cleanText(row[gameIdx]) : '';
    const newLanguage = languageIdx >= 0
      ? inferLanguageFromCleanName(normalized.clean_name, gameName, oldLanguage)
      : oldLanguage;
    row[nameIdx] = normalized.clean_name;
    namesChanged++;
    if (languageIdx >= 0 && newLanguage !== oldLanguage) {
      row[languageIdx] = newLanguage;
      languagesChanged++;
    }
    audit.push([
      r + 1,
      gameName,
      urlIdx >= 0 ? cleanText(row[urlIdx]) : '',
      oldName,
      normalized.clean_name,
      oldLanguage,
      newLanguage,
      normalized.reasons.join('|'),
    ]);
  }

  const newSheet = XLSX.utils.aoa_to_sheet(rows);
  // Preserve the original column widths where possible.
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  if (sheet['!rows']) newSheet['!rows'] = sheet['!rows'];
  if (sheet['!merges']) newSheet['!merges'] = sheet['!merges'];
  if (sheet['!autofilter']) newSheet['!autofilter'] = sheet['!autofilter'];
  workbook.Sheets[sheetName] = newSheet;
  const auditName = uniqueSheetName(workbook, 'v720_name_repair_audit');
  workbook.SheetNames.push(auditName);
  const auditSheet = XLSX.utils.aoa_to_sheet(audit);
  auditSheet['!cols'] = [
    { wch: 10 }, { wch: 28 }, { wch: 48 }, { wch: 60 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 32 },
  ];
  workbook.Sheets[auditName] = auditSheet;
  XLSX.writeFile(workbook, output, { bookType: 'xlsx', compression: true, cellStyles: true });
  console.log(JSON.stringify({
    ok: true,
    version: '7.2.0',
    input,
    output,
    sheet: sheetName,
    names_changed: namesChanged,
    languages_changed: languagesChanged,
    audit_sheet: auditName,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  removeGameTitle,
  inferLanguageFromCleanName,
};
