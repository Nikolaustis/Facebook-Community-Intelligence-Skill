'use strict';

const fs = require('fs');
const path = require('path');

const RULES = [
  ['TH', ['thailand', 'bangkok', 'thai']],
  ['VN', ['vietnam', 'viet nam', 'hanoi', 'ho chi minh', 'saigon']],
  ['ID', ['indonesia', 'jakarta']],
  ['PH', ['philippines', 'manila', 'cebu']],
  ['MY', ['malaysia', 'kuala lumpur']],
  ['JP', ['japan', 'tokyo', 'osaka']],
  ['KR', ['south korea', 'seoul', 'busan']],
  ['BR', ['brazil', 'brasil', 'sao paulo', 'rio de janeiro']],
  ['LATAM', ['mexico', 'argentina', 'chile', 'colombia', 'peru', 'latam']],
  ['EUR', ['europe', 'spain', 'portugal', 'sweden', 'norway', 'finland']],
];

function rulesPredict(text) {
  const s = String(text || '').normalize('NFKC').toLowerCase();
  for (const [label, terms] of RULES) {
    if (terms.some((term) => s.includes(term))) return label;
  }
  return null;
}

function score(cases, predictions) {
  let correct = 0;
  let abstained = 0;
  let latency = 0;
  let cost = 0;
  let latencyCount = 0;
  for (const item of cases) {
    const pred = predictions.get(item.case_id) || {};
    const label = pred.label ?? null;
    if (!label) abstained++;
    if (label === item.gold_label) correct++;
    if (Number.isFinite(pred.latency_ms)) { latency += pred.latency_ms; latencyCount++; }
    if (Number.isFinite(pred.cost_usd)) cost += pred.cost_usd;
  }
  return {
    cases: cases.length,
    accuracy: cases.length ? correct / cases.length : 0,
    abstention_rate: cases.length ? abstained / cases.length : 0,
    mean_latency_ms: latencyCount ? latency / latencyCount : null,
    total_cost_usd: cost || null,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = JSON.parse(fs.readFileSync(path.resolve(args.cases || 'benchmarks/ai_eval_cases.json'), 'utf8'));
  const rules = new Map(cases.map((item) => [item.case_id, { label: rulesPredict(item.input_text) }]));
  const result = { dataset: 'synthetic', rules: score(cases, rules) };
  if (args.predictions) {
    const external = JSON.parse(fs.readFileSync(path.resolve(args.predictions), 'utf8'));
    result.external = score(cases, new Map(external.map((item) => [item.case_id, item])));
  }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { rulesPredict, score };
