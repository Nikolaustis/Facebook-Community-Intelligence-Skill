'use strict';

const fs = require('fs');
const path = require('path');

class RunManifest {
  constructor({ outDir, mode, subjectCount }) {
    this.outDir = outDir;
    this.file = path.join(outDir, 'run_manifest.json');
    this.data = {
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running',
      mode,
      subject_count: subjectCount,
      stages: {},
      counters: {},
    };
    fs.mkdirSync(outDir, { recursive: true });
    this.flush();
  }

  start(stage) {
    this.data.stages[stage] = { started_at: new Date().toISOString(), completed_at: null, status: 'running' };
    this.flush();
  }

  end(stage, extra = {}) {
    const item = this.data.stages[stage] || {};
    Object.assign(item, extra, { completed_at: new Date().toISOString(), status: 'success' });
    this.data.stages[stage] = item;
    this.flush();
  }

  fail(stage, error) {
    const item = this.data.stages[stage] || {};
    Object.assign(item, {
      completed_at: new Date().toISOString(),
      status: 'failure',
      error: String(error && (error.stack || error.message || error)),
    });
    this.data.stages[stage] = item;
    this.data.status = 'failure';
    this.data.completed_at = new Date().toISOString();
    this.flush();
  }

  counters(values) {
    Object.assign(this.data.counters, values);
    this.flush();
  }

  complete() {
    this.data.status = 'success';
    this.data.completed_at = new Date().toISOString();
    this.flush();
  }

  flush() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
  }
}

module.exports = { RunManifest };
