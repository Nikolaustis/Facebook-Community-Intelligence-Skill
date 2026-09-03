'use strict';

const crypto = require('crypto');

function stableEvidenceId(key) {
  return `evidence:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

class EvidenceStore {
  constructor() {
    this.items = new Map();
  }

  add({ community_id, evidence_type, source_url = '', value = '', observed_at = null, raw = null }) {
    if (!community_id || !evidence_type) throw new Error('community_id and evidence_type are required');
    const key = [community_id, evidence_type, source_url, JSON.stringify(value)].join('\0');
    if (!this.items.has(key)) {
      this.items.set(key, {
        evidence_id: stableEvidenceId(key),
        community_id,
        evidence_type,
        source_url: source_url || null,
        value,
        observed_at,
        raw,
      });
    }
    return this.items.get(key);
  }

  values() {
    return [...this.items.values()];
  }
}

module.exports = { EvidenceStore };
