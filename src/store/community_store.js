'use strict';

const crypto = require('crypto');

function canonicalizeFacebookGroupUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw.replace(/^\/+/, '')}`);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((part) => part.toLowerCase() === 'groups');
    if (idx >= 0 && parts[idx + 1]) {
      return `https://www.facebook.com/groups/${parts[idx + 1]}`;
    }
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '');
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function communityIdFromUrl(url) {
  return `fbgroup:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}`;
}

function prefer(existing, incoming) {
  if (existing !== undefined && existing !== null && existing !== '') return existing;
  return incoming;
}

class CommunityStore {
  constructor() {
    this.byUrl = new Map();
  }

  upsert(row) {
    const url = canonicalizeFacebookGroupUrl(row.url || row.group_url);
    if (!url) throw new Error('community URL is required');
    const current = this.byUrl.get(url) || {
      community_id: communityIdFromUrl(url),
      platform: 'facebook',
      community_type: 'group',
      url,
    };

    const next = {
      ...current,
      name: prefer(current.name, row.name || row.group_name || null),
      members: prefer(current.members, row.members ?? null),
      posts_today: prefer(current.posts_today, row.posts_today ?? null),
      new_members_week: prefer(current.new_members_week, row.new_members_week ?? null),
      language: prefer(current.language, row.language ?? null),
      region: prefer(current.region, row.region ?? null),
    };
    this.byUrl.set(url, next);
    return next;
  }

  getByUrl(url) {
    return this.byUrl.get(canonicalizeFacebookGroupUrl(url));
  }

  values() {
    return [...this.byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  }
}

module.exports = { CommunityStore, canonicalizeFacebookGroupUrl, communityIdFromUrl };
