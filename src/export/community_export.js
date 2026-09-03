'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function rowsForSheet(rows) {
  return rows.map((row) => {
    const flat = {};
    for (const [key, value] of Object.entries(row)) {
      flat[key] = (value && typeof value === 'object') ? JSON.stringify(value) : value;
    }
    return flat;
  });
}

function exportCommunityIntelligence({
  outDir,
  subjects,
  communities,
  matches,
  evidence,
  legacyFlattened = true,
}) {
  ensureDir(outDir);
  writeJson(path.join(outDir, 'subjects.json'), subjects);
  writeJson(path.join(outDir, 'communities.json'), communities);
  writeJson(path.join(outDir, 'community_subject_matches.json'), matches);
  writeJson(path.join(outDir, 'community_evidence.json'), evidence);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rowsForSheet(communities)), 'communities');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rowsForSheet(subjects)), 'subjects');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rowsForSheet(matches)), 'matches');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rowsForSheet(evidence)), 'evidence');
  XLSX.writeFile(book, path.join(outDir, 'community_intelligence.xlsx'));

  if (legacyFlattened) {
    const subjectById = new Map(subjects.map((s) => [s.subject_id, s]));
    const communityById = new Map(communities.map((c) => [c.community_id, c]));
    const flattened = matches.map((match) => ({
      ...communityById.get(match.community_id),
      ...match,
      subject_name: subjectById.get(match.subject_id)?.subject_name || '',
      subject_type: subjectById.get(match.subject_id)?.subject_type || '',
    }));
    writeJson(path.join(outDir, 'legacy_flattened.json'), flattened);
  }

  return {
    community_count: communities.length,
    subject_count: subjects.length,
    match_count: matches.length,
    evidence_count: evidence.length,
  };
}

module.exports = { exportCommunityIntelligence };
