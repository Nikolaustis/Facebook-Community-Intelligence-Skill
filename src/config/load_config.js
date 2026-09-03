'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeConfig } = require('../domain/schema');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
}

function loadSubjectConfig(file) {
  return normalizeConfig(readJson(file));
}

module.exports = { readJson, loadSubjectConfig };
