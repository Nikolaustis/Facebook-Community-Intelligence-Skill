'use strict';

const fs = require('fs');
const path = require('path');
const { evaluateCommunitySubject } = require('../src/intelligence/match_engine');

function div(a, b) { return b ? a / b : 0; }

function runBenchmark(cases) {
  let tp = 0, fp = 0, tn = 0, fn = 0, review = 0;
  for (const item of cases) {
    const actual = evaluateCommunitySubject(item.input, item.subject).status;
    const goldPositive = item.expected_status === 'accepted';
    const actualPositive = actual === 'accepted';
    if (actual === 'review') review++;
    if (goldPositive && actualPositive) tp++;
    else if (!goldPositive && actualPositive) fp++;
    else if (!goldPositive && !actualPositive) tn++;
    else fn++;
  }
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  const f1 = div(2 * precision * recall, precision + recall);
  const rejectedOrReview = cases.length - tp - fp;
  return {
    dataset: 'synthetic',
    cases: cases.length,
    precision,
    recall,
    f1,
    candidate_recall: recall,
    manual_review_rate: div(review, cases.length),
    phase15_detail_request_reduction_rate: div(rejectedOrReview, cases.length),
    confusion: { tp, fp, tn, fn, review },
  };
}

function main() {
  const file = path.resolve(process.argv[2] || 'benchmarks/synthetic_cases.json');
  const cases = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(runBenchmark(cases), null, 2));
}

if (require.main === module) main();
module.exports = { runBenchmark };
