'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { canonicalizeFacebookGroupUrl } = require('../store/community_store');

const FIELD_CANDIDATES = {
  url: ['group_url', 'url', 'Group URL', '群组链接', '群組連結'],
  name: ['group_name', 'name', 'Group Name', '群组名称', '群組名稱'],
  subject_name: ['subject_name', 'game_name', 'game', 'Game', '目标', '目標'],
  members: ['members', 'group_members', 'member_count', 'Members'],
  posts_today: ['posts_today', 'today_posts', 'Posts Today'],
  new_members_week: ['new_members_week', 'week_new_members', 'New Members Week'],
  language: ['language', 'Language'],
  region: ['region', 'Region'],
  source_query: ['source_query', 'query', 'Source Query'],
  relevance_reason: ['relevance_reason', 'reason', 'match_reason'],
};

function pick(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== '') return row[key];
  }
  return null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeValidatedRow(row) {
  const url = canonicalizeFacebookGroupUrl(pick(row, FIELD_CANDIDATES.url));
  return {
    group_url: url,
    group_name: pick(row, FIELD_CANDIDATES.name),
    subject_name: pick(row, FIELD_CANDIDATES.subject_name),
    members: numberOrNull(pick(row, FIELD_CANDIDATES.members)),
    posts_today: numberOrNull(pick(row, FIELD_CANDIDATES.posts_today)),
    new_members_week: numberOrNull(pick(row, FIELD_CANDIDATES.new_members_week)),
    language: pick(row, FIELD_CANDIDATES.language),
    region: pick(row, FIELD_CANDIDATES.region),
    source_query: pick(row, FIELD_CANDIDATES.source_query),
    relevance_reason: pick(row, FIELD_CANDIDATES.relevance_reason),
    raw: row,
  };
}

class FacebookGroupsAdapter {
  constructor() {
    this.source_id = 'facebook_groups';
  }

  readValidatedRows(runDir) {
    const workbookPath = path.join(runDir, 'fb_monitoring_filtered.xlsx');
    if (!fs.existsSync(workbookPath)) return [];
    const book = XLSX.readFile(workbookPath);
    const rows = [];
    for (const sheetName of book.SheetNames) {
      const lower = sheetName.toLowerCase();
      if (lower.includes('summary') || lower.includes('audit')) continue;
      const sheetRows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { defval: '' });
      for (const row of sheetRows) {
        const normalized = normalizeValidatedRow({ ...row, __sheet: sheetName });
        if (normalized.group_url) rows.push(normalized);
      }
    }
    return rows;
  }
}

module.exports = { FacebookGroupsAdapter, normalizeValidatedRow, FIELD_CANDIDATES };
